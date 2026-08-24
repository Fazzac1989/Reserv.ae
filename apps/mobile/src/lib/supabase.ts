import 'react-native-url-polyfill/auto';
import { AppState } from 'react-native';
import { createAnonClient } from '@reservai/db';
import { env } from '../env';
import { secureSessionStorage } from './secure-storage';

export const supabase = createAnonClient({
  url: env.supabaseUrl,
  key: env.supabaseAnonKey,
  storage: secureSessionStorage,
  flowType: 'pkce',
  // There is no browser URL to read a session out of on a device.
  detectSessionInUrl: false,
});

/**
 * Refresh only while the app is in front. Left running in the background the
 * timer fires against a suspended network stack and burns battery for nothing.
 */
AppState.addEventListener('change', (state) => {
  if (state === 'active') {
    void supabase.auth.startAutoRefresh();
  } else {
    void supabase.auth.stopAutoRefresh();
  }
});
