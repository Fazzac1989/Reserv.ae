import Link from 'next/link';

export default function VenueNotFound() {
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 px-6 py-20">
      <h1 className="text-2xl font-medium tracking-tight">Venue not found</h1>
      <p className="text-sm text-muted-foreground">
        It may have been deleted, or the link is wrong.
      </p>
      <Link href="/venues" className="text-sm underline underline-offset-4">
        Back to venues
      </Link>
    </main>
  );
}
