/**
 * Saying "yes, that's right" out loud.
 *
 * A signal is otherwise only ever inferred, and inference is always hedged —
 * a small sample is held back, and age erodes it. When someone confirms it,
 * none of that applies any more: they have told us, and a told preference is
 * as certain as the ones they typed during onboarding.
 *
 * Kept separate from `rejected_at` rather than folded into one status column,
 * because they are answers to different questions and a person may change
 * their mind in either direction.
 */
alter table public.preference_signals
  add column confirmed_at timestamptz;

comment on column public.preference_signals.confirmed_at is
  'Set when the user confirms an inference. Makes it a stated preference, not a guess.';
