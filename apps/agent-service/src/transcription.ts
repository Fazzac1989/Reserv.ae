import type { AgentServiceEnv } from '@reservai/config';
import { ServiceError } from './errors';

/**
 * Voice-note transcription.
 *
 * Principle 4 applies here as much as to the booking rails. If no provider is
 * configured, `isTranscriptionConfigured` is false, the endpoint answers 503 and
 * the app hides the microphone. What it must never do is hand back a plausible
 * transcript that nobody actually produced — the user would confirm it, and we
 * would book against words they never said.
 */

export interface Transcript {
  readonly text: string;
  /**
   * 0..1. Whisper reports average log-probability per segment rather than a
   * confidence, so this is derived from it — good enough to decide whether to
   * make the user look twice, not a probability.
   */
  readonly confidence: number | null;
  readonly language: string | null;
}

export class TranscriptionUnavailableError extends ServiceError {
  constructor() {
    super(503, 'Voice notes are not enabled in this environment.');
  }
}

export class TranscriptionFailedError extends ServiceError {
  constructor(detail: string) {
    super(502, `Could not transcribe that recording: ${detail}`);
  }
}

export function isTranscriptionConfigured(env: AgentServiceEnv): boolean {
  return (
    Boolean(env.AI_TRANSCRIPTION_API_KEY) && env.AI_TRANSCRIPTION_PROVIDER === 'openai-whisper'
  );
}

/** Maps Whisper's mean log-probability onto something a UI can act on. */
function confidenceFrom(segments: unknown): number | null {
  if (!Array.isArray(segments) || segments.length === 0) return null;

  const logprobs = segments
    .map((s) => (s as { avg_logprob?: unknown }).avg_logprob)
    .filter((v): v is number => typeof v === 'number');
  if (logprobs.length === 0) return null;

  const mean = logprobs.reduce((a, b) => a + b, 0) / logprobs.length;
  // avg_logprob is <= 0; around -0.2 is clean speech and -1.0 is poor.
  const scaled = Math.exp(mean);
  return Math.min(1, Math.max(0, Number(scaled.toFixed(3))));
}

export async function transcribe(
  env: AgentServiceEnv,
  audio: Blob,
  filename: string,
): Promise<Transcript> {
  if (!isTranscriptionConfigured(env)) throw new TranscriptionUnavailableError();

  const form = new FormData();
  form.append('file', audio, filename);
  form.append('model', 'whisper-1');
  form.append('response_format', 'verbose_json');
  // The pilot is Dubai: English and Arabic both need to work, so no language
  // hint — letting Whisper detect beats forcing the wrong one.

  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.AI_TRANSCRIPTION_API_KEY}` },
    body: form,
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => `HTTP ${response.status}`);
    throw new TranscriptionFailedError(detail.slice(0, 300));
  }

  const json = (await response.json()) as {
    text?: unknown;
    language?: unknown;
    segments?: unknown;
  };

  const text = typeof json.text === 'string' ? json.text.trim() : '';
  if (!text) throw new TranscriptionFailedError('the recording produced no words');

  return {
    text,
    confidence: confidenceFrom(json.segments),
    language: typeof json.language === 'string' ? json.language : null,
  };
}
