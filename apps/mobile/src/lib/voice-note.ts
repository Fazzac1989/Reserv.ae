import * as FileSystem from 'expo-file-system/legacy';
import { supabase } from './supabase';

/**
 * Uploading a recording to the private voice-notes bucket.
 *
 * The path is namespaced by user id because that is what the storage policy
 * checks — `voice-notes/{uid}/…` is the only shape a user may write.
 */

const BUCKET = 'voice-notes';
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/**
 * base64 → bytes, by hand.
 *
 * React Native has neither `atob` nor `Buffer`, and pulling a polyfill in for
 * one function is not worth the bundle. This is the standard four-characters-to
 * -three-bytes unpacking.
 */
export function base64ToBytes(base64: string): Uint8Array {
  const clean = base64.replace(/[^A-Za-z0-9+/]/g, '');
  const bytes = new Uint8Array((clean.length * 3) >> 2);

  let byte = 0;
  let buffer = 0;
  let bits = 0;

  for (const char of clean) {
    const value = B64.indexOf(char);
    if (value === -1) continue;
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes[byte++] = (buffer >> bits) & 0xff;
    }
  }

  return bytes.subarray(0, byte);
}

export interface UploadedNote {
  /** Storage path, which is what the agent service is given. */
  audioRef: string;
  bytes: number;
}

export async function uploadVoiceNote(uri: string, userId: string): Promise<UploadedNote> {
  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const bytes = base64ToBytes(base64);

  if (bytes.byteLength === 0) {
    throw new Error('That recording came out empty.');
  }

  // Timestamped rather than random so an ops review of a booking's audit trail
  // can see the order things were said in.
  const audioRef = `${userId}/${Date.now()}.m4a`;

  const { error } = await supabase.storage.from(BUCKET).upload(audioRef, bytes, {
    contentType: 'audio/m4a',
    upsert: false,
  });
  if (error) throw error;

  return { audioRef, bytes: bytes.byteLength };
}
