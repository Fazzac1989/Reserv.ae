import { describe, expect, it } from 'vitest';
import {
  isHeaderSafeKey,
  isLocalDemoKey,
  keyMatchesProject,
  loadAgentServiceEnv,
  projectRefFromKey,
} from './env';

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

function keyFor(ref: string, role = 'anon'): string {
  const part = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return [part({ alg: 'HS256', typ: 'JWT' }), part({ iss: 'supabase', ref, role }), 'sig'].join(
    '.',
  );
}

describe('keys from the wrong project', () => {
  it('reads the project out of a key', () => {
    expect(projectRefFromKey(keyFor('abcdefghijklmnopqrst'))).toBe('abcdefghijklmnopqrst');
  });

  it('accepts a key issued for the project the URL names', () => {
    expect(keyMatchesProject('https://abc.supabase.co', keyFor('abc'))).toBe(true);
  });

  it('rejects a key issued for a different project', () => {
    // The failure this was written for: eight projects in one account, and the
    // key copied from the dashboard that happened to be open.
    expect(keyMatchesProject('https://abc.supabase.co', keyFor('xyz'))).toBe(false);
  });

  it('says which project the key belongs to', () => {
    expect(() =>
      loadAgentServiceEnv({
        ...base,
        SUPABASE_URL: 'https://gtolhuxoreacaqwxjccq.supabase.co',
        SUPABASE_ANON_KEY: keyFor('taawgixxkvqkbhnzxxzm'),
      }),
    ).toThrow(/taawgixxkvqkbhnzxxzm.*gtolhuxoreacaqwxjccq/s);
  });

  it('passes a key with no readable claims rather than guessing', () => {
    // sb_publishable_ keys carry nothing to compare, and refusing them would
    // block the format Supabase is moving to.
    expect(keyMatchesProject('https://abc.supabase.co', 'sb_publishable_Ab3xY')).toBe(true);
  });

  it('ignores a URL that is not a Supabase project address', () => {
    expect(keyMatchesProject('http://127.0.0.1:54421', keyFor('xyz'))).toBe(true);
  });
});

describe('a masked key copied from a dashboard', () => {
  // What Vercel actually shipped: the visible prefix, then the mask.
  const masked = 'eyJhbGci' + '•'.repeat(40);

  it('recognises a real key as sendable', () => {
    expect(isHeaderSafeKey(keyFor('abc'))).toBe(true);
  });

  it('refuses bullets', () => {
    expect(isHeaderSafeKey(masked)).toBe(false);
  });

  it('refuses an ellipsis, the other way a dashboard shortens a value', () => {
    expect(isHeaderSafeKey('eyJhbGci…IE0')).toBe(false);
  });

  it('refuses a zero-width space, which nothing on screen would show', () => {
    expect(isHeaderSafeKey('eyJhbGci​IE0')).toBe(false);
  });

  it('refuses a stray space', () => {
    expect(isHeaderSafeKey('eyJ hBGci')).toBe(false);
  });

  it('names the mistake rather than the encoding', () => {
    // The browser says "String contains non ISO-8859-1 code point", which
    // sends you to look at character sets instead of at the copy button.
    expect(() => loadAgentServiceEnv({ ...base, SUPABASE_ANON_KEY: masked })).toThrow(
      /masked value copied as bullets/,
    );
  });

  it('fails before the project comparison, which cannot read a masked key', () => {
    expect(() => loadAgentServiceEnv({ ...base, SUPABASE_ANON_KEY: masked })).not.toThrow(
      /belongs to Supabase project/,
    );
  });
});

describe('where there is no Buffer', () => {
  /**
   * The client bundles run these same checks in a browser, which has atob and
   * no Buffer. Reaching for Buffer there throws, and because an undecodable
   * key is treated as one we cannot judge, every check turned into a silent
   * pass — in the one place a wrong key reaches somebody trying to sign in.
   */
  function withoutBuffer<T>(fn: () => T): T {
    const saved = globalThis.Buffer;
    // @ts-expect-error removing it is the whole point of the test
    delete globalThis.Buffer;
    try {
      return fn();
    } finally {
      globalThis.Buffer = saved;
    }
  }

  // Built while Buffer still exists; the test is about reading them, not
  // writing them.
  const wrongProject = keyFor('xyz');
  const rightProject = keyFor('abcdef');
  const demoKey = keyFor('local', 'anon').replace(
    Buffer.from(JSON.stringify({ iss: 'supabase', ref: 'local', role: 'anon' })).toString(
      'base64url',
    ),
    Buffer.from(JSON.stringify({ iss: 'supabase-demo', ref: 'local', role: 'anon' })).toString(
      'base64url',
    ),
  );

  it('still reads the project out of a key', () => {
    expect(withoutBuffer(() => projectRefFromKey(rightProject))).toBe('abcdef');
  });

  it('still catches a key from the wrong project', () => {
    expect(withoutBuffer(() => keyMatchesProject('https://abc.supabase.co', wrongProject))).toBe(
      false,
    );
  });

  it('still recognises the CLI demo key', () => {
    expect(withoutBuffer(() => isLocalDemoKey(demoKey))).toBe(true);
  });

  it('still accepts a key that does belong to the project', () => {
    expect(withoutBuffer(() => keyMatchesProject('https://abcdef.supabase.co', rightProject))).toBe(
      true,
    );
  });
});
