import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Encrypting the tokens that let Suhail read somebody's calendar.
 *
 * A refresh token is a standing grant. It does not expire on its own, it
 * cannot be rotated without the user noticing, and anyone holding one can read
 * that person's calendar until they think to revoke it. It is the most
 * dangerous value this system will ever store, and it must not sit in Postgres
 * in a form a database backup would disclose.
 *
 * AES-256-GCM, with the key held only in the environment. The database never
 * sees the key, so a leaked dump is a leak of ciphertext. GCM rather than CBC
 * because it authenticates: a tampered ciphertext fails to decrypt rather than
 * decrypting to something else.
 */

const ALGORITHM = 'aes-256-gcm';
const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;

/** Version prefix, so the format can change without orphaning what is stored. */
const VERSION = 'v1';

export class EncryptionKeyError extends Error {}

/**
 * The key, from a 64-character hex string.
 *
 * Deliberately strict. A short key, a passphrase, or a base64 value that
 * happens to parse would all produce something that encrypts and decrypts
 * perfectly while providing a fraction of the strength it appears to — the
 * kind of weakness nothing ever surfaces.
 */
export function keyFrom(hex: string): Buffer {
  if (!/^[0-9a-f]{64}$/i.test(hex)) {
    throw new EncryptionKeyError(
      'TOKEN_ENCRYPTION_KEY must be 64 hex characters (32 bytes). ' +
        'Generate one with: openssl rand -hex 32',
    );
  }
  return Buffer.from(hex, 'hex');
}

/**
 * `v1.<iv>.<tag>.<ciphertext>`, all base64url.
 *
 * A fresh IV every time, which is what stops two encryptions of the same token
 * being recognisably identical.
 */
export function encrypt(plaintext: string, key: Buffer): string {
  if (key.length !== KEY_BYTES) throw new EncryptionKeyError('Key must be 32 bytes.');

  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [
    VERSION,
    iv.toString('base64url'),
    tag.toString('base64url'),
    ciphertext.toString('base64url'),
  ].join('.');
}

export function decrypt(payload: string, key: Buffer): string {
  const parts = payload.split('.');
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new EncryptionKeyError('Not an encrypted token this service wrote.');
  }

  const iv = Buffer.from(parts[1]!, 'base64url');
  const tag = Buffer.from(parts[2]!, 'base64url');
  const ciphertext = Buffer.from(parts[3]!, 'base64url');

  if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) {
    throw new EncryptionKeyError('Encrypted token is malformed.');
  }

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  // Throws if the ciphertext or tag was altered, which is the point of GCM.
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

/**
 * Constant-time comparison, for the OAuth state parameter.
 *
 * Comparing with === leaks how much of the value matched through timing, which
 * is enough to forge one given patience. The state parameter is the only thing
 * standing between a callback and a cross-site request forgery on somebody's
 * calendar.
 */
export function matches(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
