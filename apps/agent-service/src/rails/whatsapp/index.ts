import type { AgentServiceEnv } from '@reservai/config';
import { TwilioWhatsAppProvider } from './twilio';
import { Dialog360Provider } from './dialog360';
import { WhatsAppNotConfiguredError, type WhatsAppProvider } from './provider';

export * from './provider';
export { TwilioWhatsAppProvider } from './twilio';
export { Dialog360Provider } from './dialog360';

/**
 * Builds the configured BSP, or returns null.
 *
 * Null is a real answer and callers must handle it: with no BSP chosen the rail
 * is disabled and says so, rather than silently doing nothing or pretending a
 * message was sent.
 */
export function createWhatsAppProvider(env: AgentServiceEnv): WhatsAppProvider | null {
  if (!env.FLAG_RAIL_WHATSAPP) return null;

  switch (env.WHATSAPP_BSP) {
    case 'twilio':
      return new TwilioWhatsAppProvider({
        accountSid: env.TWILIO_ACCOUNT_SID ?? '',
        authToken: env.TWILIO_AUTH_TOKEN ?? '',
        fromE164: env.WHATSAPP_BOOKER_NUMBER_ID ?? '',
      });

    case '360dialog':
      return new Dialog360Provider({
        apiKey: env.WHATSAPP_ACCESS_TOKEN ?? '',
        appSecret: env.WHATSAPP_APP_SECRET ?? '',
      });

    default:
      // The flag is on but no BSP was chosen. That is a misconfiguration worth
      // failing loudly on rather than degrading into a dead rail.
      throw new WhatsAppNotConfiguredError(
        'FLAG_RAIL_WHATSAPP is on but WHATSAPP_BSP is unset. Choose twilio or 360dialog.',
      );
  }
}

/** Why the rail is unavailable, in words an operator can act on. */
export function whatsappUnavailableReason(env: AgentServiceEnv): string | null {
  if (!env.FLAG_RAIL_WHATSAPP) return 'The WhatsApp rail is switched off in this environment.';
  if (env.WHATSAPP_BSP === 'unset') return 'No WhatsApp provider has been chosen yet.';
  if (!env.WHATSAPP_BOOKER_NUMBER_ID) return 'No booker number is configured.';
  return null;
}
