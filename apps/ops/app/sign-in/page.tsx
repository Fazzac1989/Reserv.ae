import { SignInForm } from '../../components/sign-in-form';

/**
 * `next` is read here on the server and handed to the form as a prop. Reading
 * it with useSearchParams instead would opt the subtree out of prerendering
 * and leave the first paint as a spinner.
 */
export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  // Only same-origin paths. An absolute URL here would make the sign-in link an
  // open redirect that could bounce a signed-in operator to another site.
  const safeNext = next && next.startsWith('/') && !next.startsWith('//') ? next : '/';

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">Reserv</p>
        <h1 className="mt-2 text-2xl font-medium tracking-tight">Ops console</h1>
        <SignInForm next={safeNext} />
      </div>
    </main>
  );
}
