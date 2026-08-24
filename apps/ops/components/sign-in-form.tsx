'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../lib/supabase/client';

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const CODE_LENGTH = 6;

/**
 * Ops sign-in: email one-time code, same flow as the mobile app.
 *
 * `shouldCreateUser` is false here. The console is staff-only, so an unknown
 * address must fail rather than quietly creating an account that then bounces
 * off the ops gate — a confusing dead end, and an open sign-up surface.
 */
export function SignInForm({ next }: { next: string }) {
  const router = useRouter();

  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const emailValid = EMAIL_PATTERN.test(email.trim());

  async function sendCode(event: React.FormEvent) {
    event.preventDefault();
    if (!emailValid || busy) return;
    setBusy(true);
    setError(null);

    const supabase = createClient();
    const { error: sendError } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: { shouldCreateUser: false },
    });
    setBusy(false);

    if (sendError) {
      setError(
        sendError.message.includes('Signups not allowed')
          ? 'That address has no console account. Ask an admin to add you.'
          : sendError.message,
      );
      return;
    }
    setStep('code');
  }

  async function verify(event: React.FormEvent) {
    event.preventDefault();
    if (code.length !== CODE_LENGTH || busy) return;
    setBusy(true);
    setError(null);

    const supabase = createClient();
    const { error: verifyError } = await supabase.auth.verifyOtp({
      email: email.trim().toLowerCase(),
      token: code.trim(),
      type: 'email',
    });
    setBusy(false);

    if (verifyError) {
      setCode('');
      setError(verifyError.message);
      return;
    }
    router.replace(next);
    router.refresh();
  }

  return (
    <>
      {step === 'email' ? (
        <form onSubmit={sendCode} className="mt-8 flex flex-col gap-3">
          <label htmlFor="email" className="text-sm text-neutral-600 dark:text-neutral-400">
            Work email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={busy}
            className="rounded-lg border border-neutral-300 bg-transparent px-3 py-2.5 text-sm outline-none focus:border-neutral-900 dark:border-neutral-700 dark:focus:border-neutral-100"
            placeholder="you@example.com"
          />
          <button
            type="submit"
            disabled={!emailValid || busy}
            className="rounded-lg bg-neutral-900 px-3 py-2.5 text-sm font-medium text-white disabled:bg-neutral-300 dark:bg-neutral-100 dark:text-neutral-900 dark:disabled:bg-neutral-800"
          >
            {busy ? 'Sending…' : 'Send code'}
          </button>
          {/*
            Sending and entering are separate problems. A code can be in hand
            while a fresh send is refused — the mail allowance is per project
            and per hour, so one person exhausts it for everyone — and without
            this the box for the code you are holding cannot be reached.
          */}
          <button
            type="button"
            onClick={() => {
              if (!emailValid) return;
              setError(null);
              setStep('code');
            }}
            disabled={!emailValid || busy}
            className="text-sm text-neutral-500 underline-offset-4 hover:underline disabled:no-underline disabled:opacity-50 dark:text-neutral-400"
          >
            I already have a code
          </button>
        </form>
      ) : (
        <form onSubmit={verify} className="mt-8 flex flex-col gap-3">
          <label htmlFor="code" className="text-sm text-neutral-600 dark:text-neutral-400">
            Six-digit code for {email}
          </label>
          <input
            id="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            maxLength={CODE_LENGTH}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, CODE_LENGTH))}
            disabled={busy}
            className="rounded-lg border border-neutral-300 bg-transparent px-3 py-2.5 text-center text-lg tracking-[0.5em] outline-none focus:border-neutral-900 dark:border-neutral-700 dark:focus:border-neutral-100"
            placeholder="000000"
          />
          <button
            type="submit"
            disabled={code.length !== CODE_LENGTH || busy}
            className="rounded-lg bg-neutral-900 px-3 py-2.5 text-sm font-medium text-white disabled:bg-neutral-300 dark:bg-neutral-100 dark:text-neutral-900 dark:disabled:bg-neutral-800"
          >
            {busy ? 'Checking…' : 'Sign in'}
          </button>
          <button
            type="button"
            onClick={() => {
              setStep('email');
              setCode('');
              setError(null);
            }}
            className="text-sm text-neutral-500 underline-offset-4 hover:underline"
          >
            Use a different email
          </button>
        </form>
      )}

      {error ? (
        <p role="alert" className="mt-4 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : null}
    </>
  );
}
