import { SignOutButton } from '../../components/sign-out-button';

/**
 * A signed-in user without the ops role. Deliberately says what to do next
 * rather than pretending the page does not exist — the person is staff, they
 * just have not been granted access yet.
 */
export default function NoAccessPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="max-w-md">
        <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">Reserv</p>
        <h1 className="mt-2 text-2xl font-medium tracking-tight">No console access</h1>
        <p className="mt-4 text-sm leading-6 text-neutral-600 dark:text-neutral-400">
          Your account is signed in but does not hold the ops role. An admin can grant it, or
          someone with the service role key can run:
        </p>
        <pre className="mt-4 overflow-x-auto rounded-lg border border-neutral-200 px-3 py-3 text-xs dark:border-neutral-800">
          select public.grant_role_by_email(&apos;you@example.com&apos;, &apos;ops&apos;);
        </pre>
        <div className="mt-6">
          <SignOutButton />
        </div>
      </div>
    </main>
  );
}
