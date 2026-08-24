import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { requireOps } from '../../../../lib/auth';
import { createVenue } from '../../../../lib/venues/actions';
import { VenueForm } from '../../../../components/venues/venue-form';

export const dynamic = 'force-dynamic';

export default async function NewVenuePage() {
  await requireOps();

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-10">
      <Link
        href="/venues"
        className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" />
        Venues
      </Link>

      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-medium tracking-tight">Add venue</h1>
        <p className="text-sm text-muted-foreground">
          Starts as a lead. Channels, policies and contacts come next, on the venue page.
        </p>
      </div>

      <VenueForm action={createVenue} submitLabel="Create venue" />
    </main>
  );
}
