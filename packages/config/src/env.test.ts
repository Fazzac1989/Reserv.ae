import { describe, expect, it } from 'vitest';
import { loadAgentServiceEnv } from './env';

/**
 * WEB_ORIGINS decides which browsers may call the agent service, so a value
 * that parses when it should not is a hole rather than an inconvenience.
 */

const base: NodeJS.ProcessEnv = {
  NODE_ENV: 'production',
  RESERVAI_ENV: 'production',
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_ANON_KEY: 'anon-key',
  SUPABASE_SERVICE_ROLE_KEY: 'service-key',
  REDIS_URL: 'redis://127.0.0.1:6379',
  INTERNAL_API_SECRET: 'a-secret-of-sufficient-length',
  ANTHROPIC_API_KEY: 'sk-ant-test',
  AI_MODEL_FAST: 'claude-haiku-4-5-20251001',
  AI_MODEL_STRONG: 'claude-opus-5',
};

const load = (webOrigins?: string) =>
  loadAgentServiceEnv(webOrigins === undefined ? base : { ...base, WEB_ORIGINS: webOrigins });

describe('WEB_ORIGINS', () => {
  it('allows no browser at all when unset', () => {
    // The phone app sends no Origin, so an unset value is a working default
    // rather than a missing one.
    expect(load().WEB_ORIGINS).toEqual([]);
  });

  it('reads a single origin', () => {
    expect(load('https://app.reserv.ae').WEB_ORIGINS).toEqual(['https://app.reserv.ae']);
  });

  it('reads several, ignoring the spacing between them', () => {
    expect(load('https://app.reserv.ae, http://localhost:4173').WEB_ORIGINS).toEqual([
      'https://app.reserv.ae',
      'http://localhost:4173',
    ]);
  });

  it('ignores a trailing comma rather than allowing an empty origin', () => {
    expect(load('https://app.reserv.ae,').WEB_ORIGINS).toEqual(['https://app.reserv.ae']);
  });

  it('keeps the port, which is part of the origin', () => {
    expect(load('http://localhost:4173').WEB_ORIGINS).toEqual(['http://localhost:4173']);
  });

  it('refuses a path, which no browser will ever send as an Origin', () => {
    // A pasted address is the likely mistake, and it would silently match
    // nothing at all.
    expect(() => load('https://app.reserv.ae/chat')).toThrow(/nothing after the host/);
  });

  it('refuses a bare host with no scheme', () => {
    expect(() => load('app.reserv.ae')).toThrow(/nothing after the host/);
  });

  it('refuses a wildcard', () => {
    // Opening the service to every origin has to be a deliberate code change,
    // not a character someone typed into a hosting dashboard.
    expect(() => load('*')).toThrow(/nothing after the host/);
  });

  it('refuses one bad entry among good ones', () => {
    expect(() => load('https://app.reserv.ae,*')).toThrow(/nothing after the host/);
  });
});
