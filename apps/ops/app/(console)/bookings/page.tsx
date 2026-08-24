import Link from 'next/link';
import { requireOps } from '../../../lib/auth';
import { listQueue } from '../../../lib/bookings/queries';
import { BookingQueueRow } from '../../../components/bookings/queue-row';

export const dynamic = 'force-dynamic';

export default async function BookingsPage({
  searchParams,
}: {
  searchParams: Promise<{ all?: string }>;
}) {
  await requireOps();
  const { all } = await searchParams;
  const rows = await listQueue(all === '1');

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 px-6 py-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-medium tracking-tight">Booking queue</h1>
          <p className="text-sm text-muted-foreground">
            {rows.length} to work. During the pilot you are the booking agent — the rails automate
            this later.
          </p>
        </div>
        <Link
          href={all === '1' ? '/bookings' : '/bookings?all=1'}
          className="text-sm underline underline-offset-4"
        >
          {all === '1' ? 'Show only open' : 'Show everything'}
        </Link>
      </header>

      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
          Nothing waiting. Approved bookings land here the moment a user accepts a suggestion.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((row) => (
            <BookingQueueRow key={row.id} row={row} />
          ))}
        </ul>
      )}
    </main>
  );
}
