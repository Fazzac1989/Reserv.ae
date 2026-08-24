import { describe, expect, it } from 'vitest';
import { AGENT_NAMES, AGENTS, agentCan, assertAgentCan, CAPABILITIES } from './agents';

describe('agent permissions', () => {
  it('registers every named agent exactly once', () => {
    expect(Object.keys(AGENTS).sort()).toEqual([...AGENT_NAMES].sort());
    for (const name of AGENT_NAMES) {
      expect(AGENTS[name].name).toBe(name);
    }
  });

  it('grants only capabilities that exist', () => {
    for (const name of AGENT_NAMES) {
      for (const capability of AGENTS[name].capabilities) {
        expect(CAPABILITIES).toContain(capability);
      }
    }
  });

  // Principle 1, expressed as a permission rather than a prompt instruction.
  it('gives no agent the power to confirm a booking', () => {
    expect(CAPABILITIES).not.toContain('confirm:booking');
    for (const name of AGENT_NAMES) {
      expect(AGENTS[name].capabilities.some((c) => c.startsWith('confirm:'))).toBe(false);
    }
  });

  it('keeps the concierge out of venue contact entirely', () => {
    expect(agentCan('concierge', 'send:venue_message')).toBe(false);
    expect(agentCan('concierge', 'place:venue_call')).toBe(false);
    expect(agentCan('concierge', 'write:request')).toBe(true);
  });

  it('lets the ops copilot draft venue messages but never send them', () => {
    expect(agentCan('ops_copilot', 'draft:venue_message')).toBe(true);
    expect(agentCan('ops_copilot', 'send:venue_message')).toBe(false);
  });

  it('gates the rail agents behind their feature flags', () => {
    expect(AGENTS.booker_wa.requiresFlag).toBe('FLAG_RAIL_WHATSAPP');
    expect(AGENTS.booker_voice.requiresFlag).toBe('FLAG_RAIL_VOICE');
    expect(AGENTS.concierge.requiresFlag).toBeUndefined();
  });

  it('throws on an ungranted capability rather than returning false quietly', () => {
    expect(() => assertAgentCan('curator', 'send:venue_message')).toThrow(/does not hold/);
    expect(() => assertAgentCan('curator', 'write:suggestion')).not.toThrow();
  });
});
