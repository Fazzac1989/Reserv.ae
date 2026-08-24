import * as SecureStore from 'expo-secure-store';
import type { SessionStorage } from '@reservai/db';

/**
 * Session storage backed by the device keychain / keystore.
 *
 * AsyncStorage is the common choice here, but it is plain text on disk and this
 * is a bearer token for someone's booking history and personal details.
 * SecureStore caps a value at 2048 bytes and a Supabase session with a large
 * JWT can exceed that, so values are chunked and reassembled.
 */

const CHUNK_SIZE = 1800;

function chunkKey(key: string, index: number): string {
  return `${key}.${index}`;
}

/** SecureStore rejects most punctuation in keys. */
function safeKey(key: string): string {
  return key.replace(/[^A-Za-z0-9._-]/g, '_');
}

async function clearChunks(key: string): Promise<void> {
  // The count is stored under the base key; without it we cannot know how many
  // chunks existed, so clear defensively up to a generous ceiling.
  for (let i = 0; i < 20; i += 1) {
    const existing = await SecureStore.getItemAsync(chunkKey(key, i));
    if (existing === null) break;
    await SecureStore.deleteItemAsync(chunkKey(key, i));
  }
}

export const secureSessionStorage: SessionStorage = {
  async getItem(rawKey) {
    const key = safeKey(rawKey);
    const header = await SecureStore.getItemAsync(key);
    if (header === null) return null;

    const count = Number.parseInt(header, 10);
    if (!Number.isInteger(count) || count < 1) {
      // Written by an older build before chunking; treat it as the value.
      return header;
    }

    const parts: string[] = [];
    for (let i = 0; i < count; i += 1) {
      const part = await SecureStore.getItemAsync(chunkKey(key, i));
      // A missing chunk means a torn write. Report no session rather than a
      // corrupted one — the user signs in again, which is recoverable.
      if (part === null) return null;
      parts.push(part);
    }
    return parts.join('');
  },

  async setItem(rawKey, value) {
    const key = safeKey(rawKey);
    await clearChunks(key);

    const chunks: string[] = [];
    for (let i = 0; i < value.length; i += CHUNK_SIZE) {
      chunks.push(value.slice(i, i + CHUNK_SIZE));
    }

    for (const [index, chunk] of chunks.entries()) {
      await SecureStore.setItemAsync(chunkKey(key, index), chunk);
    }
    await SecureStore.setItemAsync(key, String(chunks.length));
  },

  async removeItem(rawKey) {
    const key = safeKey(rawKey);
    await clearChunks(key);
    await SecureStore.deleteItemAsync(key);
  },
};
