import type { SessionStorage } from '@reservai/db';

/**
 * Session storage in the browser.
 *
 * The native build keeps the session in the device keychain. A browser has no
 * equivalent — localStorage is readable by any script on the origin — so this
 * is deliberately the weaker of the two, and the reason the phone app remains
 * the one we point people at for daily use.
 *
 * localStorage rather than a cookie because the session never goes to a server:
 * this app talks to Supabase and the agent service directly, so sending the
 * token on every document request would widen its reach for nothing.
 */

function available(): Storage | null {
  try {
    // Safari in private mode has the API but throws on write, and an embedded
    // webview may have no storage at all. Either way the app should still run
    // and simply ask the person to sign in again.
    const probe = '__reservai__';
    window.localStorage.setItem(probe, probe);
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    return null;
  }
}

const memory = new Map<string, string>();

export const secureSessionStorage: SessionStorage = {
  async getItem(key) {
    const store = available();
    if (store === null) return memory.get(key) ?? null;
    return store.getItem(key);
  },

  async setItem(key, value) {
    const store = available();
    if (store === null) {
      memory.set(key, value);
      return;
    }
    store.setItem(key, value);
  },

  async removeItem(key) {
    const store = available();
    if (store === null) {
      memory.delete(key);
      return;
    }
    store.removeItem(key);
  },
};
