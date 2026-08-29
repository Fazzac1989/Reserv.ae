import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AgentServiceEnv } from '@reservai/config';
import { ClaudeProvider, ModelOutputError, runConciergeTurn } from '@reservai/ai';
import { requireUser } from '../auth';
import { bookableZones } from '../directory';
import { resolveStandingEntity } from '../memory';
import { MODEL_LIMIT } from '../rate-limit';
import { serviceClient, userClient } from '../supabase';
import {
  isTranscriptionConfigured,
  transcribe,
  TranscriptionUnavailableError,
} from '../transcription';

interface Options {
  env: AgentServiceEnv;
}

const messageBody = z.object({
  conversationId: z.string().uuid().optional(),
  text: z.string().min(1).max(4000),
  /** Set when this turn came from a voice note the user confirmed. */
  audioRef: z.string().max(500).optional(),
  transcriptConfidence: z.number().min(0).max(1).optional(),
});

const transcribeBody = z.object({
  audioRef: z.string().min(1).max(500),
});

/**
 * The concierge conversation.
 *
 * The model call happens here rather than on the device for the obvious reason
 * — the API key must never ship in a bundle — and for a less obvious one: the
 * turn writes an assistant message, a request row and an audit trail, and those
 * should not depend on a phone staying awake between two round trips.
 */
export async function registerConciergeRoutes(
  app: FastifyInstance,
  { env }: Options,
): Promise<void> {
  const provider = new ClaudeProvider({
    apiKey: env.ANTHROPIC_API_KEY,
    models: { fast: env.AI_MODEL_FAST, strong: env.AI_MODEL_STRONG },
  });

  app.post('/concierge/messages', MODEL_LIMIT, async (request, reply) => {
    const user = await requireUser(request, env);

    const parsed = messageBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.issues[0]?.message ?? 'Bad request.' });
    }
    const body = parsed.data;

    // A voice turn must point at audio the user actually owns. The path is
    // namespaced by user id and storage RLS enforces it, but checking here
    // means a mismatch is a clear 400 rather than a confusing storage error.
    if (body.audioRef && !body.audioRef.startsWith(`${user.id}/`)) {
      return reply.status(400).send({ error: 'That recording does not belong to you.' });
    }

    const asUser = userClient(env, user.accessToken);
    const asService = serviceClient(env);

    const [{ data: preferences }, { data: profile }] = await Promise.all([
      asUser.from('user_preferences').select('*').eq('user_id', user.id).single(),
      asUser.from('users').select('timezone').eq('id', user.id).single(),
    ]);

    if (!preferences) {
      return reply.status(409).send({ error: 'Finish setting up your profile first.' });
    }

    // Reuse today's conversation rather than starting a new thread per message.
    let conversationId = body.conversationId;
    if (!conversationId) {
      const { data: created, error } = await asUser
        .from('conversations')
        .insert({ user_id: user.id, channel: 'app' })
        .select('id')
        .single();
      if (error) throw error;
      conversationId = created.id;
    }

    const { data: history } = await asUser
      .from('messages')
      .select('role, content')
      .eq('conversation_id', conversationId)
      .order('created_at')
      .limit(40);

    const { data: userMessage, error: userMessageError } = await asUser
      .from('messages')
      .insert({
        conversation_id: conversationId,
        user_id: user.id,
        role: 'user',
        kind: body.audioRef ? 'voice' : 'text',
        content: body.text,
        audio_ref: body.audioRef ?? null,
        transcript_confidence: body.transcriptConfidence ?? null,
      })
      .select('id')
      .single();
    if (userMessageError) throw userMessageError;

    let turn;
    try {
      turn = await runConciergeTurn(provider, {
        allowedZones: await bookableZones(env),
        context: {
          now: new Date().toISOString(),
          timezone: profile?.timezone ?? 'Asia/Dubai',
          homeZone: preferences.home_zone,
          preferredZones: preferences.preferred_zones ?? [],
          defaultPartySize: preferences.default_party_size,
          priceBandMin: preferences.price_band_min,
          priceBandMax: preferences.price_band_max,
          cuisinesLoved: preferences.cuisines_loved ?? [],
          cuisinesAvoided: preferences.cuisines_avoided ?? [],
          dietary: preferences.dietary ?? [],
          allergies: preferences.allergies ?? [],
        },
        history: history ?? [],
        message: body.text,
        correlationId: conversationId,
      });
    } catch (error) {
      // The model failing is not the user's fault and must not look like a
      // reply. Say so plainly rather than inventing something to show.
      if (error instanceof ModelOutputError) {
        request.log.warn({ err: error, conversationId }, 'Concierge produced no usable output');
        return reply
          .status(503)
          .send({ error: 'I could not read that just now. Try saying it again?' });
      }
      throw error;
    }

    // "My barber", "our usual place". Resolved after parsing so the vertical
    // the model worked out can narrow it down, and left null when we cannot be
    // certain — the Concierge then asks rather than booking the wrong place.
    const standing = await resolveStandingEntity(env, user.id, body.text, turn.intent.vertical);

    const intent = standing ? { ...turn.intent, named_venue_id: standing.venueId } : turn.intent;

    // The request row is the durable record of what was asked for. It is
    // written with the service role because parsed intent is ours, not
    // something a client may edit.
    const { data: requestRow, error: requestError } = await asService
      .from('requests')
      .insert({
        user_id: user.id,
        conversation_id: conversationId,
        input: body.audioRef
          ? {
              kind: 'voice',
              audio_ref: body.audioRef,
              transcript: body.text,
              transcript_confidence: body.transcriptConfidence ?? null,
            }
          : { kind: 'text', text: body.text },
        // The generated Json type will not accept a named interface directly,
        // even though every field is JSON-safe. Round-tripping keeps the value
        // identical and states plainly that this column is a document.
        parsed_intent: JSON.parse(JSON.stringify(intent)),
        status: turn.ready ? 'parsed' : 'needs_clarification',
        clarifying_question: turn.clarifyingQuestion,
      })
      .select('id')
      .single();
    if (requestError) throw requestError;

    const replyText = turn.clarifyingQuestion
      ? `${turn.reply}\n\n${turn.clarifyingQuestion}`.trim()
      : turn.reply;

    await asService.from('messages').insert({
      conversation_id: conversationId,
      user_id: user.id,
      role: 'assistant',
      kind: 'text',
      content: replyText,
      request_id: requestRow.id,
      metadata: {
        agent: 'concierge',
        model: turn.model,
        usage: turn.usage,
        defaulted: turn.defaulted,
        ready: turn.ready,
      },
    });

    await asService.from('messages').update({ request_id: requestRow.id }).eq('id', userMessage.id);

    return reply.send({
      conversationId,
      requestId: requestRow.id,
      reply: replyText,
      intent,
      standing: standing
        ? { venueId: standing.venueId, venueName: standing.venueName, source: standing.source }
        : null,
      /** Fields taken from the profile rather than from what they said. */
      defaulted: turn.defaulted,
      ready: turn.ready,
    });
  });

  /**
   * Transcribes a voice note the app has already uploaded to storage.
   *
   * The transcript comes back for the user to read and correct before anything
   * is done with it — a booking made from a misheard request is precisely the
   * failure this step exists to prevent.
   */
  app.post('/concierge/transcribe', MODEL_LIMIT, async (request, reply) => {
    const user = await requireUser(request, env);

    if (!isTranscriptionConfigured(env)) throw new TranscriptionUnavailableError();

    const parsed = transcribeBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Which recording?' });
    }

    const { audioRef } = parsed.data;
    if (!audioRef.startsWith(`${user.id}/`)) {
      return reply.status(403).send({ error: 'That recording does not belong to you.' });
    }

    const { data: file, error } = await serviceClient(env)
      .storage.from('voice-notes')
      .download(audioRef);
    if (error || !file) {
      return reply.status(404).send({ error: 'That recording is not there.' });
    }

    const transcript = await transcribe(env, file, audioRef.split('/').pop() ?? 'note.m4a');
    return reply.send(transcript);
  });
}
