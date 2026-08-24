import Link from 'next/link';
import { Plus } from 'lucide-react';
import { requireOps } from '../../../lib/auth';
import { countByStatus, listVenues, type VenueFilters } from '../../../lib/venues/queries';
import {
  ONBOARDING_STATUSES,
  PIPELINE,
  VERTICALS,
  ZONES,
  labelFor,
  type OnboardingStatus,
  type Vertical,
  type Zone,
} from '../../../lib/venues/constants';
import { VenueFiltersBar } from '../../../components/venues/venue-filters';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';

export const dynamic = 'force-dynamic';

function statusVariant(status: OnboardingStatus) {
  if (status === 'live') return 'default' as const;
  if (status === 'lost' || status === 'paused') return 'muted' as const;
  return 'secondary' as const;
}

function oneOf<T extends string>(value: string | undefined, allowed: readonly T[]): T | undefined {
  return allowed.includes(value as T) ? (value as T) : undefined;
}

export default async function VenuesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requireOps();
  const params = await searchParams;

  // Anything unrecognised is dropped rather than passed to the query, so a
  // hand-edited URL cannot produce a Postgres error page.
  const filters: VenueFilters = {
    q: params.q?.trim() || undefined,
    zone: oneOf<Zone>(params.zone, ZONES),
    vertical: oneOf<Vertical>(params.vertical, VERTICALS),
    status: oneOf<OnboardingStatus>(params.status, ONBOARDING_STATUSES),
    needsChannel: params.needsChannel === '1',
  };

  const [venues, byStatus] = await Promise.all([listVenues(filters), countByStatus()]);
  const total = Object.values(byStatus).reduce((a, b) => a + b, 0);

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-medium tracking-tight">Venues</h1>
          <p className="text-sm text-muted-foreground">
            {total} total · the pilot target is 50, of which at least 20 API-bookable
          </p>
        </div>
        <Button asChild>
          <Link href="/venues/new">
            <Plus />
            Add venue
          </Link>
        </Button>
      </header>

      {/* The acquisition funnel, in the order the founder walks it. */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {PIPELINE.map((status) => (
          <Link
            key={status}
            href={`/venues?status=${status}`}
            className="rounded-lg border p-4 transition-colors hover:bg-accent"
          >
            <p className="text-2xl font-medium tabular-nums">{byStatus[status]}</p>
            <p className="mt-1 text-xs uppercase tracking-widest text-muted-foreground">{status}</p>
          </Link>
        ))}
      </section>

      <VenueFiltersBar />

      {venues.length === 0 ? (
        <p className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
          No venues match. Clear the filters, or add the first one.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/50 text-left">
              <tr>
                <th className="px-4 py-2.5 font-medium">Name</th>
                <th className="px-4 py-2.5 font-medium">Segment</th>
                <th className="px-4 py-2.5 font-medium">Zone</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 font-medium">Rails</th>
                <th className="px-4 py-2.5 font-medium">Ready</th>
              </tr>
            </thead>
            <tbody>
              {venues.map((venue) => (
                <tr key={venue.id} className="border-b last:border-0 hover:bg-accent/50">
                  <td className="px-4 py-2.5">
                    <Link href={`/venues/${venue.id}`} className="font-medium hover:underline">
                      {venue.name}
                    </Link>
                    {venue.is_demo ? (
                      <Badge variant="muted" className="ml-2">
                        demo
                      </Badge>
                    ) : null}
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">
                    {venue.vertical} · band {venue.price_band}
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">{labelFor(venue.zone)}</td>
                  <td className="px-4 py-2.5">
                    <Badge variant={statusVariant(venue.onboarding_status)}>
                      {venue.onboarding_status}
                    </Badge>
                  </td>
                  <td className="px-4 py-2.5 tabular-nums text-muted-foreground">
                    {venue.enabledChannelCount}/{venue.channelCount}
                  </td>
                  <td className="px-4 py-2.5">
                    {/*
                      What is still missing before this venue can take a real
                      booking. Consent is the one that blocks going live.
                    */}
                    <div className="flex flex-wrap gap-1">
                      {venue.booking_consent_obtained_at ? null : (
                        <Badge variant="outline">no consent</Badge>
                      )}
                      {venue.hasPolicy ? null : <Badge variant="outline">no policy</Badge>}
                      {venue.contactCount === 0 ? (
                        <Badge variant="outline">no contact</Badge>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
