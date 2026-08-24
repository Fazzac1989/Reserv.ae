import type { flagSchema } from './env';
import type { z } from 'zod';

export type Flags = z.infer<typeof flagSchema>;

export const RAIL_FLAGS = {
  api: 'FLAG_RAIL_API',
  whatsapp: 'FLAG_RAIL_WHATSAPP',
  voice: 'FLAG_RAIL_VOICE',
  manual: 'FLAG_RAIL_MANUAL',
} as const satisfies Record<string, keyof Flags>;

export type RailKind = keyof typeof RAIL_FLAGS;

/**
 * Principle 4 — no fake integrations. A rail whose flag is off is *disabled*,
 * and callers must surface that to the user rather than pretending it worked.
 * Never branch this into a mock response on a production path.
 */
export function isRailEnabled(flags: Flags, rail: RailKind): boolean {
  return flags[RAIL_FLAGS[rail]];
}

export function enabledRails(flags: Flags): RailKind[] {
  return (Object.keys(RAIL_FLAGS) as RailKind[]).filter((r) => isRailEnabled(flags, r));
}
