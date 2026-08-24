import type { AgentServiceEnv } from '@reservai/config';
import { serviceClient } from '../supabase';

/**
 * Push notifications, through Expo.
 *
 * Expo's push service is what an Expo app gets for free, and it needs no
 * credentials of ours — the token identifies the device and Expo routes to APNs
 * or FCM. That is why this works today where the WhatsApp rail cannot.
 */

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

export interface PushMessage {
  readonly title: string;
  readonly body: string;
  /** Deep-link payload so tapping the notification opens the right booking. */
  readonly data?: Record<string, string>;
}

export interface PushResult {
  readonly delivered: number;
  readonly failed: number;
  readonly errors: string[];
}

/** A token Expo has told us is dead. Keeping it means failing forever. */
const DEAD_TOKEN_ERRORS = new Set(['DeviceNotRegistered', 'InvalidCredentials']);

export async function sendPush(
  env: AgentServiceEnv,
  userId: string,
  message: PushMessage,
): Promise<PushResult> {
  const supabase = serviceClient(env);

  const { data: tokens } = await supabase
    .from('push_tokens')
    .select('id, token')
    .eq('user_id', userId);

  if (!tokens || tokens.length === 0) {
    // Not an error. Plenty of users never grant notification permission, and a
    // booking is not less confirmed because nobody could be pinged about it.
    return { delivered: 0, failed: 0, errors: ['no registered device'] };
  }

  const payload = tokens.map((t) => ({
    to: t.token,
    title: message.title,
    body: message.body,
    sound: 'default',
    ...(message.data ? { data: message.data } : {}),
  }));

  let response: Response;
  try {
    response = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    return {
      delivered: 0,
      failed: tokens.length,
      errors: [error instanceof Error ? error.message : 'push transport failed'],
    };
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => `HTTP ${response.status}`);
    return { delivered: 0, failed: tokens.length, errors: [detail.slice(0, 200)] };
  }

  const body = (await response.json().catch(() => null)) as {
    data?: { status?: string; message?: string; details?: { error?: string } }[];
  } | null;

  const tickets = body?.data ?? [];
  let delivered = 0;
  const errors: string[] = [];
  const dead: string[] = [];

  tickets.forEach((ticket, index) => {
    if (ticket.status === 'ok') {
      delivered += 1;
      return;
    }
    errors.push(ticket.message ?? 'push rejected');
    if (ticket.details?.error && DEAD_TOKEN_ERRORS.has(ticket.details.error)) {
      const id = tokens[index]?.id;
      if (id) dead.push(id);
    }
  });

  // Uninstalled apps and reinstalled devices leave tokens behind. Dropping them
  // keeps the failure count meaningful instead of permanently noisy.
  if (dead.length > 0) {
    await supabase.from('push_tokens').delete().in('id', dead);
  }

  return { delivered, failed: tickets.length - delivered, errors };
}
