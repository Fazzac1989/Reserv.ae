import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { decrypt, encrypt, EncryptionKeyError, keyFrom, matches } from './crypto';

const KEY = randomBytes(32);
const HEX = KEY.toString('hex');
const TOKEN = '1//0eXaMpLe-refresh-token-value-that-is-fairly-long';

describe('keyFrom', () => {
  it('accepts 64 hex characters', () => {
    expect(keyFrom(HEX)).toHaveLength(32);
  });

  it('refuses a passphrase', () => {
    // Which would otherwise encrypt and decrypt perfectly while providing a
    // fraction of the strength it appears to.
    expect(() => keyFrom('correct horse battery staple')).toThrow(EncryptionKeyError);
  });

  it('refuses a key that is merely too short', () => {
    expect(() => keyFrom(randomBytes(16).toString('hex'))).toThrow(EncryptionKeyError);
  });

  it('says how to make one', () => {
    expect(() => keyFrom('nope')).toThrow(/openssl rand -hex 32/);
  });
});

describe('encrypt and decrypt', () => {
  it('round-trips a token', () => {
    expect(decrypt(encrypt(TOKEN, KEY), KEY)).toBe(TOKEN);
  });

  it('never writes the token in the clear', () => {
    expect(encrypt(TOKEN, KEY)).not.toContain('refresh-token-value');
  });

  it('produces a different ciphertext every time', () => {
    // Without a fresh IV, two users granting the same scope would have
    // recognisably identical rows, and a repeated token would be visible as a
    // repeat even to somebody who could not read it.
    expect(encrypt(TOKEN, KEY)).not.toBe(encrypt(TOKEN, KEY));
  });

  it('refuses a ciphertext encrypted under a different key', () => {
    expect(() => decrypt(encrypt(TOKEN, KEY), randomBytes(32))).toThrow();
  });

  it('refuses a tampered ciphertext rather than returning something else', () => {
    // The reason for GCM. With CBC this would decrypt to garbage and be used.
    const payload = encrypt(TOKEN, KEY);
    const parts = payload.split('.');
    const bytes = Buffer.from(parts[3]!, 'base64url');
    bytes[0] = bytes[0]! ^ 0xff;
    parts[3] = bytes.toString('base64url');
    expect(() => decrypt(parts.join('.'), KEY)).toThrow();
  });

  it('refuses a tampered authentication tag', () => {
    const parts = encrypt(TOKEN, KEY).split('.');
    const tag = Buffer.from(parts[2]!, 'base64url');
    tag[0] = tag[0]! ^ 0xff;
    parts[2] = tag.toString('base64url');
    expect(() => decrypt(parts.join('.'), KEY)).toThrow();
  });

  it('refuses something this service did not write', () => {
    expect(() => decrypt('just-a-string', KEY)).toThrow(EncryptionKeyError);
  });

  it('refuses a payload whose version it does not know', () => {
    // So a future format change cannot be fed to the current reader.
    const parts = encrypt(TOKEN, KEY).split('.');
    parts[0] = 'v2';
    expect(() => decrypt(parts.join('.'), KEY)).toThrow(EncryptionKeyError);
  });

  it('handles an empty string without producing an empty ciphertext', () => {
    expect(decrypt(encrypt('', KEY), KEY)).toBe('');
  });
});

describe('matches', () => {
  it('is true for equal values', () => {
    expect(matches('abc123', 'abc123')).toBe(true);
  });

  it('is false for different values', () => {
    expect(matches('abc123', 'abc124')).toBe(false);
  });

  it('is false for different lengths rather than throwing', () => {
    // timingSafeEqual throws on a length mismatch; a thrown error inside an
    // OAuth callback is a 500 where a plain rejection was wanted.
    expect(matches('short', 'considerably longer')).toBe(false);
  });
});
