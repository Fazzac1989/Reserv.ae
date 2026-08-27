import { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Screen } from '../../src/components/ui/screen';
import { TextField } from '../../src/components/ui/field';
import { Body, Muted, Display } from '../../src/components/ui/text';
import { requestEmailCode, verifyEmailCode } from '../../src/lib/auth';

const CODE_LENGTH = 6;
const RESEND_SECONDS = 30;

export default function Verify() {
  const router = useRouter();
  const { email } = useLocalSearchParams<{ email?: string }>();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(RESEND_SECONDS);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  async function onVerify(value: string) {
    if (!email || value.length !== CODE_LENGTH || busy) return;
    setBusy(true);
    setError(null);
    const result = await verifyEmailCode(email, value);
    setBusy(false);

    if (result.ok) {
      // The root gate routes onward once the session lands.
      return;
    }
    setCode('');
    setError(result.message);
  }

  function onChange(next: string) {
    const digits = next.replace(/\D/g, '').slice(0, CODE_LENGTH);
    setCode(digits);
    setError(null);
    // Submit as soon as the code is complete rather than making them hunt for
    // a button.
    if (digits.length === CODE_LENGTH) void onVerify(digits);
  }

  async function onResend() {
    if (!email || cooldown > 0 || busy) return;
    setBusy(true);
    setError(null);
    const result = await requestEmailCode(email);
    setBusy(false);
    if (result.ok) {
      setNotice('A new code is on its way.');
      setCooldown(RESEND_SECONDS);
    } else {
      setError(result.message);
    }
  }

  if (!email) {
    return (
      <Screen>
        <View className="flex-1 items-center justify-center gap-4 px-7">
          <Body className="text-center">We lost track of which address to verify.</Body>
          <Pressable onPress={() => router.replace('/(auth)/sign-in')} accessibilityRole="button">
            <Body className="font-body-medium text-ink underline dark:text-porcelain">
              Start again
            </Body>
          </Pressable>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View className="flex-1 justify-center gap-10 px-7">
          <View className="gap-3">
            <Display>Check your email</Display>
            <Body>We sent a six-digit code to {email}.</Body>
          </View>

          <View className="gap-3">
            <TextField
              value={code}
              onChangeText={onChange}
              placeholder="000000"
              keyboardType="number-pad"
              inputMode="numeric"
              autoComplete="one-time-code"
              textContentType="oneTimeCode"
              maxLength={CODE_LENGTH}
              editable={!busy}
              autoFocus
              className="text-center text-title tracking-[12px]"
            />

            {busy ? <ActivityIndicator /> : null}

            {error ? (
              <Muted className="text-clay" accessibilityLiveRegion="polite">
                {error}
              </Muted>
            ) : null}
            {notice && !error ? <Muted accessibilityLiveRegion="polite">{notice}</Muted> : null}

            <Pressable
              onPress={onResend}
              disabled={cooldown > 0 || busy}
              accessibilityRole="button"
              accessibilityState={{ disabled: cooldown > 0 || busy }}
              className="py-2"
            >
              <Muted>{cooldown > 0 ? `Resend in ${cooldown}s` : 'Send another code'}</Muted>
            </Pressable>
          </View>

          <Pressable
            onPress={() => router.replace('/(auth)/sign-in')}
            accessibilityRole="button"
            className="py-2"
          >
            <Muted>Use a different email</Muted>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}
