import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as AppleAuthentication from 'expo-apple-authentication';
import { Screen } from '../../src/components/ui/screen';
import { Button } from '../../src/components/ui/button';
import { TextField } from '../../src/components/ui/field';
import { Body, Muted, Display, Meta } from '../../src/components/ui/text';
import {
  isAppleAvailable,
  isGoogleEnabled,
  requestEmailCode,
  signInWithApple,
  signInWithGoogle,
} from '../../src/lib/auth';

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export default function SignIn() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [appleAvailable, setAppleAvailable] = useState(false);

  useEffect(() => {
    void isAppleAvailable().then(setAppleAvailable);
  }, []);

  const emailValid = EMAIL_PATTERN.test(email.trim());

  async function onSendCode() {
    if (!emailValid || busy) return;
    setBusy(true);
    setError(null);
    const result = await requestEmailCode(email);
    setBusy(false);

    if (result.ok) {
      router.push({ pathname: '/(auth)/verify', params: { email: email.trim().toLowerCase() } });
    } else {
      setError(result.message);
    }
  }

  async function onProvider(run: () => Promise<{ ok: boolean; message?: string }>) {
    if (busy) return;
    setBusy(true);
    setError(null);
    const result = await run();
    setBusy(false);
    // An empty message means the user cancelled; that is not an error.
    if (!result.ok && result.message) setError(result.message);
  }

  return (
    <Screen>
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View className="flex-1 justify-center gap-10 px-7">
          <View className="gap-3">
            <Meta>Reserv</Meta>
            <Display>Your secretary for Dubai</Display>
            <Body>It suggests, then it books.</Body>
          </View>

          <View className="gap-3">
            <TextField
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              autoCapitalize="none"
              autoComplete="email"
              autoCorrect={false}
              keyboardType="email-address"
              inputMode="email"
              returnKeyType="go"
              onSubmitEditing={onSendCode}
              editable={!busy}
            />

            <Button label="Continue" onPress={onSendCode} disabled={!emailValid} loading={busy} />

            <Muted>We will email you a six-digit code. No password to remember.</Muted>

            {error ? (
              <Muted className="text-alert" accessibilityLiveRegion="polite">
                {error}
              </Muted>
            ) : null}
          </View>

          {/*
            Apple and Google appear only where they are genuinely wired up.
            A provider button that fails on tap is worse than no button.
          */}
          {appleAvailable || isGoogleEnabled() ? (
            <View className="gap-3">
              <View className="flex-row items-center gap-3">
                <View className="h-px flex-1 bg-grey-line" />
                <Muted>or</Muted>
                <View className="h-px flex-1 bg-grey-line" />
              </View>

              {appleAvailable ? (
                <AppleAuthentication.AppleAuthenticationButton
                  buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
                  buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
                  cornerRadius={14}
                  style={{ height: 56 }}
                  onPress={() => void onProvider(signInWithApple)}
                />
              ) : null}

              {isGoogleEnabled() ? (
                <Pressable
                  onPress={() => void onProvider(signInWithGoogle)}
                  disabled={busy}
                  accessibilityRole="button"
                  className="h-14 items-center justify-center rounded-card border border-grey-line"
                >
                  <Body className="font-body-medium text-ink dark:text-paper">
                    Continue with Google
                  </Body>
                </Pressable>
              ) : null}
            </View>
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}
