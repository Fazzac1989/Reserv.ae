import type { Effort, ModelTier } from './provider';

/**
 * Named agents with explicit permissions.
 *
 * Capabilities are declared here and enforced at the service layer — a prompt
 * that says "you may not confirm bookings" is a suggestion; a capability check
 * is a rule.
 */

export const CAPABILITIES = [
  'read:user_profile',
  'read:venue_directory',
  'read:venue_policies',
  'read:booking_history',
  'write:request',
  'write:suggestion',
  'write:booking_draft',
  'draft:venue_message',
  'send:venue_message',
  'place:venue_call',
  'create:ops_task',
] as const;

export type Capability = (typeof CAPABILITIES)[number];

export const AGENT_NAMES = [
  'concierge',
  'curator',
  'booker_wa',
  'booker_voice',
  'ops_copilot',
] as const;
export type AgentName = (typeof AGENT_NAMES)[number];

export interface AgentDefinition {
  readonly name: AgentName;
  readonly description: string;
  readonly tier: ModelTier;
  readonly effort: Effort;
  readonly capabilities: readonly Capability[];
  /** Feature flag that must be on for this agent to run at all. */
  readonly requiresFlag?: 'FLAG_RAIL_WHATSAPP' | 'FLAG_RAIL_VOICE';
}

/**
 * Note what is absent: no agent can confirm a booking. Confirmation is not a
 * capability any model holds — it belongs to the state machine, backed by
 * evidence. See core/booking/transitions.ts.
 */
export const AGENTS: Record<AgentName, AgentDefinition> = {
  concierge: {
    name: 'concierge',
    description:
      'User-facing. Parses intent from text and voice notes, asks at most one clarifying question, presents suggestions with an opinion, takes approval.',
    tier: 'fast',
    effort: 'low',
    capabilities: ['read:user_profile', 'read:venue_directory', 'write:request'],
  },

  curator: {
    name: 'curator',
    description:
      'Ranks venues that survived deterministic filtering against the taste profile, and writes the why-this-fits rationale.',
    tier: 'strong',
    effort: 'high',
    capabilities: [
      'read:user_profile',
      'read:venue_directory',
      'read:venue_policies',
      'read:booking_history',
      'write:suggestion',
      'write:booking_draft',
    ],
  },

  booker_wa: {
    name: 'booker_wa',
    description:
      'Drafts and conducts venue WhatsApp threads in a professional-PA register, and parses replies into structured outcomes with a confidence score.',
    tier: 'fast',
    effort: 'medium',
    capabilities: [
      'read:venue_policies',
      'draft:venue_message',
      'send:venue_message',
      'create:ops_task',
    ],
    requiresFlag: 'FLAG_RAIL_WHATSAPP',
  },

  booker_voice: {
    name: 'booker_voice',
    description:
      'Conducts outbound calls against a strict script with fixed negotiation bounds. Anything out of bounds pauses the call and asks the user.',
    tier: 'strong',
    effort: 'medium',
    capabilities: ['read:venue_policies', 'place:venue_call', 'create:ops_task'],
    requiresFlag: 'FLAG_RAIL_VOICE',
  },

  ops_copilot: {
    name: 'ops_copilot',
    description:
      'Summarises stuck bookings for the ops console and drafts venue follow-ups for a human to approve and send.',
    tier: 'strong',
    effort: 'medium',
    capabilities: [
      'read:user_profile',
      'read:venue_directory',
      'read:venue_policies',
      'read:booking_history',
      'draft:venue_message',
      'create:ops_task',
    ],
  },
};

export function agentCan(name: AgentName, capability: Capability): boolean {
  return AGENTS[name].capabilities.includes(capability);
}

/** Throws rather than returning false — call sites should not be able to ignore it. */
export function assertAgentCan(name: AgentName, capability: Capability): void {
  if (!agentCan(name, capability)) {
    throw new Error(
      `Agent "${name}" does not hold capability "${capability}". Add it to AGENTS deliberately, or route this through an agent that does.`,
    );
  }
}

/**
 * Negotiation bounds for the voice rail. Outside these the agent must stop and
 * put the user back in the loop rather than improvise.
 */
export const VOICE_NEGOTIATION_BOUNDS = {
  /** Accept a slot within this many minutes either side of the request. */
  timeWindowMinutes: 45,
  /** Party size is never negotiable — it is what the user asked for. */
  partySizeAdjustable: false,
  maxCallAttempts: 2,
} as const;
