import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AgentServiceEnv } from '@reservai/config';
import { ClaudeProvider } from '@reservai/ai';
import { requireUser } from '../auth';
import { serviceClient, userClient } from '../supabase';
import { ServiceError } from '../errors';
import { createWhatsAppProvider, whatsappUnavailableReason } from '../rails/whatsapp';
import { WhatsAppRail } from '../rails/whatsapp/rail';
import { applyTransition } from '../bookings/transition';

interface Options {
  env: AgentServiceEnv;
}

const params = z.object({ messageId: z.string().uuid() });
const editBody = z.object({ body: z.string().min(1).max(4000).optional() });

async function assertOps(env: AgentServiceEnv, accessToken: string, userId: string): Promise<void> {
  const { data } = await userClient(env, accessToken)
    .from('user_roles')
    .select('role')
    .eq('user_id', userId);

  const isOps = (data ?? []).some((r) => r.role === 'ops' || r.role === 'admin');
  if (!isOps) throw new ServiceError(403, 'Ops access required.');
}

/**
 * The human-in-the-loop half of the WhatsApp rail.
 *
 * Every venue starts with approval required, so in the pilot a person reads
 * every word before it reaches a venue. Approving is a deliberate act by a
 * named operator and it is recorded as one.
 */
export async function registerWhatsAppRoutes(
  app: FastifyInstance,
  { env }: Options,
): Promise<void> {
  const bsp = createWhatsAppProvider(env);
  const model = new ClaudeProvider({
    apiKey: env.ANTHROPIC_API_KEY,
    models: { fast: env.AI_MODEL_FAST, strong: env.AI_MODEL_STRONG },
  });

  /** The drafts waiting on a human, oldest first. */
  app.get('/whatsapp/pending', async (request, reply) => {
    const user = await requireUser(request, env);
    await assertOps(env, user.accessToken, user.id);

    const { data, error } = await serviceClient(env)
      .from('venue_messages')
      .select(
        'id, body, error_message, created_at, booking_id, venue_id, venues(name), bookings(scheduled_for, party_size, status)',
      )
      .eq('status', 'awaiting_approval')
      .order('created_at');
    if (error) throw error;

    return reply.send({
      available: whatsappUnavailableReason(env) === null,
      unavailableReason: whatsappUnavailableReason(env),
      pending: data ?? [],
    });
  });

  /**
   * Approve and send.
   *
   * The operator may edit the draft first — what they approve is what goes,
   * not what the agent wrote.
   */
  app.post('/whatsapp/messages/:messageId/approve', async (request, reply) => {
    const user = await requireUser(request, env);
    await assertOps(env, user.accessToken, user.id);

    const unavailable = whatsappUnavailableReason(env);
    if (unavailable || !bsp) throw new ServiceError(503, unavailable ?? 'Rail unavailable.');

    const parsedParams = params.safeParse(request.params);
    if (!parsedParams.success) return reply.status(400).send({ error: 'Which message?' });

    const parsedBody = editBody.safeParse(request.body ?? {});
    if (!parsedBody.success) return reply.status(400).send({ error: 'That edit is not valid.' });

    const supabase = serviceClient(env);

    const { data: message } = await supabase
      .from('venue_messages')
      .select('id, status, body, venue_id, booking_id')
      .eq('id', parsedParams.data.messageId)
      .maybeSingle();

    if (!message) return reply.status(404).send({ error: 'No such message.' });
    if (message.status !== 'awaiting_approval') {
      // Two operators opening the same queue is normal; both sending is not.
      throw new ServiceError(409, `That message is already ${message.status}.`);
    }

    const { data: channel } = await supabase
      .from('venue_booking_channels')
      .select('config')
      .eq('venue_id', message.venue_id)
      .eq('kind', 'whatsapp')
      .maybeSingle();

    const toE164 = (channel?.config as { phone_e164?: string } | null)?.phone_e164;
    if (!toE164) throw new ServiceError(409, 'That venue has no WhatsApp number configured.');

    const body = parsedBody.data.body?.trim() || message.body;

    await supabase
      .from('venue_messages')
      .update({
        body,
        status: 'approved',
        approved_by: user.id,
        approved_at: new Date().toISOString(),
      })
      .eq('id', message.id);

    const rail = new WhatsAppRail(env, bsp, model);
    const result = await rail.send(message.id, toE164, body);

    // The booking is now genuinely waiting on the venue, and the SLA clock
    // that drives escalation starts from this transition.
    if (result.awaitingVenue && message.booking_id) {
      const { data: booking } = await supabase
        .from('bookings')
        .select('status')
        .eq('id', message.booking_id)
        .single();

      if (booking?.status === 'attempting') {
        await applyTransition(env, {
          bookingId: message.booking_id,
          event: 'await_venue',
          actor: 'ops',
          actorId: user.id,
          reason: 'Approved and sent to the venue.',
          correlationId: message.booking_id,
        });
      }
    }

    if (message.booking_id) {
      await supabase
        .from('ops_tasks')
        .update({
          status: 'resolved',
          resolved_at: new Date().toISOString(),
          resolution_note: 'Message approved and sent.',
        })
        .eq('booking_id', message.booking_id)
        .eq('kind', 'approve_outbound_message')
        .in('status', ['open', 'in_progress']);
    }

    return reply.send({ sent: result.outcome !== 'error', result });
  });

  /** Discard a draft without sending it. */
  app.post('/whatsapp/messages/:messageId/reject', async (request, reply) => {
    const user = await requireUser(request, env);
    await assertOps(env, user.accessToken, user.id);

    const parsedParams = params.safeParse(request.params);
    if (!parsedParams.success) return reply.status(400).send({ error: 'Which message?' });

    const reason = z.object({ reason: z.string().min(3).max(500) }).safeParse(request.body);
    if (!reason.success) {
      return reply.status(400).send({ error: 'Say why you are discarding it.' });
    }

    const supabase = serviceClient(env);
    const { error } = await supabase
      .from('venue_messages')
      .update({ status: 'failed', error_message: `Rejected by ops: ${reason.data.reason}` })
      .eq('id', parsedParams.data.messageId)
      .eq('status', 'awaiting_approval');
    if (error) throw error;

    return reply.send({ ok: true });
  });

  /** The full thread for a booking, for the ops booking record. */
  app.get('/bookings/:bookingId/thread', async (request, reply) => {
    const user = await requireUser(request, env);
    await assertOps(env, user.accessToken, user.id);

    const parsed = z.object({ bookingId: z.string().uuid() }).safeParse(request.params);
    if (!parsed.success) return reply.status(400).send({ error: 'Which booking?' });

    const { data, error } = await serviceClient(env)
      .from('venue_messages')
      .select(
        'id, direction, status, body, parsed_outcome, parsed_confidence, approved_by, approved_at, sent_at, created_at, error_message',
      )
      .eq('booking_id', parsed.data.bookingId)
      .order('created_at');
    if (error) throw error;

    return reply.send({ thread: data ?? [] });
  });
}
