'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createClient } from '../lib/supabase/client';

export function SignOutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await createClient().auth.signOut();
        router.replace('/sign-in');
        router.refresh();
      }}
      className="rounded-lg border border-neutral-300 px-3 py-2 text-sm font-medium disabled:opacity-50 dark:border-neutral-700"
    >
      {busy ? 'Signing out…' : 'Sign out'}
    </button>
  );
}
