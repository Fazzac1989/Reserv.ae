import { Platform } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { supabase } from './supabase';
import { env } from '../env';

/**
 * Auth for the pilot: email one-time codes as the universal path, with Apple
 * and Google as shortcuts where they are actually configured.
 *
 * Principle 4 applies to sign-in too. `isAppleAvailable` and `isGoogleEnabled`
 * gate the buttons on real configuration, so an unconfigured provider is
 * visibly absent rather than a button that fails when tapped.
 */

export type AuthResult = { ok: true } | { ok: false; message: string };

function messageFor(error: unknown, fallback: string): string {
  if (error && typeof error === 'object' && 'message' in error) {
    const message = String((error as { message: unknown }).message);
    // Supabase phrases this as an error; for the user it is just a wait.
    if (message.includes('For security purposes')) {
      return 'Please wait a moment before requesting another code.';
    }
    return message;
  }
  return fallback;
}

/** Sends a 6-digit code. `shouldCreateUser` stays true — the pilot is invite-gated in the app, not here. */
export async function requestEmailCode(email: string): Promise<AuthResult> {
  const { error } = await supabase.auth.signInWithOtp({
    email: email.trim().toLowerCase(),
    options: { shouldCreateUser: true },
  });
  return error
    ? { ok: false, message: messageFor(error, 'Could not send the code.') }
    : { ok: true };
}

export async function verifyEmailCode(email: string, token: string): Promise<AuthResult> {
  const { error } = await supabase.auth.verifyOtp({
    email: email.trim().toLowerCase(),
    token: token.trim(),
    type: 'email',
  });
  return error
    ? { ok: false, message: messageFor(error, 'That code was not accepted.') }
    : { ok: true };
}

// --- Apple -----------------------------------------------------------------

export async function isAppleAvailable(): Promise<boolean> {
  if (Platform.OS !== 'ios') return false;
  return AppleAuthentication.isAvailableAsync();
}

export async function signInWithApple(): Promise<AuthResult> {
  try {
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });

    if (!credential.identityToken) {
      return { ok: false, message: 'Apple did not return an identity token.' };
    }

    const { error } = await supabase.auth.signInWithIdToken({
      provider: 'apple',
      token: credential.identityToken,
    });
    return error
      ? { ok: false, message: messageFor(error, 'Apple sign-in failed.') }
      : { ok: true };
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === 'ERR_REQUEST_CANCELED'
    ) {
      return { ok: false, message: '' };
    }
    return { ok: false, message: messageFor(error, 'Apple sign-in failed.') };
  }
}

// --- Google ----------------------------------------------------------------

/** Google needs a client id we do not have until the OAuth app is registered. */
export function isGoogleEnabled(): boolean {
  return env.googleClientId !== undefined;
}

export async function signInWithGoogle(): Promise<AuthResult> {
  if (!isGoogleEnabled()) {
    return { ok: false, message: 'Google sign-in is not configured for this build.' };
  }

  const redirectTo = Linking.createURL('/auth/callback');
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo, skipBrowserRedirect: true },
  });

  if (error || !data.url) {
    return { ok: false, message: messageFor(error, 'Could not start Google sign-in.') };
  }

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== 'success') {
    return { ok: false, message: '' };
  }

  const code = Linking.parse(result.url).queryParams?.['code'];
  if (typeof code !== 'string') {
    return { ok: false, message: 'Google did not return an authorization code.' };
  }

  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
  return exchangeError
    ? { ok: false, message: messageFor(exchangeError, 'Google sign-in failed.') }
    : { ok: true };
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}
