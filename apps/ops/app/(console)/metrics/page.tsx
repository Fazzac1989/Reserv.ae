import Link from 'next/link';
import { requireOps } from '../../../lib/auth';
import { loadScorecard } from '../../../lib/metrics/queries';
import { Target } from '../../../components/metrics/target';
import { Badge } from '../../../components/ui/badge';

export const dynamic = 'force-dynamic';

const RANGES = [
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' },
  { days: 90, label: 'Whole pilot' },
];

export default async function MetricsPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  await requireOps();
  const params = await searchParams;
  const days = RANGES.some((r) => String(r.days) === params.days) ? Number(params.days) : 30;

  const s = await loadScorecard(days);
  const { funnel } = s;

  // The latest cohort with a full 14 days behind it. A cohort from three days
  // ago showing 0% retention is not a result, it is an incomplete measurement.
  const mature = s.cohorts.filter((c) => Date.parse(c.cohort_week) < Date.now() - 14 * 86400_000);
  const latestCohort = mature[0];

  const totalNoShows = s.venues.reduce((sum, v) => sum + v.no_show_at_venue, 0);
  const totalConfirmed = s.venues.reduce((sum, v) => sum + v.confirmed, 0);
  const failureRate = totalConfirmed > 0 ? (100 * totalNoShows) / totalConfirmed : null;

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-8 px-6 py-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-medium tracking-tight">Pilot scorecard</h1>
          <p className="text-sm text-muted-foreground">
            The six numbers the pilot is judged on, against their targets.
          </p>
        </div>
        <div className="flex gap-2">
          {RANGES.map((range) => (
            <Link
              key={range.days}
              href={`/metrics?days=${range.days}`}
              className={
                range.days === days
                  ? 'rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground'
                  : 'rounded-md border px-3 py-1.5 text-sm hover:bg-accent'
              }
            >
              {range.label}
            </Link>
          ))}
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Target
          label="Requests → confirmed"
          value={funnel.confirmed_of_all}
          unit="%"
          target={60}
          direction="above"
          sample={funnel.requests}
          detail={`${funnel.confirmed} of ${funnel.requests} requests`}
        />
        <Target
          label="Of requests we could serve"
          value={funnel.confirmed_of_served}
          unit="%"
          target={75}
          direction="above"
          sample={funnel.suggested}
          detail={`${funnel.confirmed} of ${funnel.suggested} that got options`}
        />
        <Target
          label="Second booking in 14 days"
          value={latestCohort?.returned_pct ?? null}
          unit="%"
          target={40}
          direction="above"
          sample={latestCohort?.users ?? 0}
          minSample={5}
          detail={
            latestCohort
              ? `week of ${new Date(latestCohort.cohort_week).toLocaleDateString('en-GB')}`
              : undefined
          }
        />
        <Target
          label="Failures found at the venue"
          value={failureRate === null ? null : Number(failureRate.toFixed(1))}
          unit="%"
          target={5}
          direction="below"
          sample={totalConfirmed}
          detail={`${totalNoShows} of ${totalConfirmed} confirmed`}
        />
        <Target
          label="Would pay AED 99/mo"
          value={s.pricing.yes_pct}
          unit="%"
          target={30}
          direction="above"
          sample={s.pricing.asked}
          minSample={5}
          detail={`${s.pricing.yes} yes, ${s.pricing.maybe} maybe, of ${s.pricing.asked} asked`}
        />
        <Target
          label="Venues live"
          value={s.liveVenues}
          target={50}
          direction="above"
          sample={s.liveVenues}
          minSample={0}
          detail="pilot target is 50"
        />
      </section>

      {/*
        Both conversion rates are shown because they answer different questions,
        and agreeing which one is "the" number before week 12 saves an argument
        about the denominator when it matters.
      */}
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium uppercase tracking-widest text-muted-foreground">
          The funnel
        </h2>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/50 text-left">
              <tr>
                <th className="px-4 py-2.5 font-medium">Stage</th>
                <th className="px-4 py-2.5 font-medium">Count</th>
                <th className="px-4 py-2.5 font-medium">Of requests</th>
              </tr>
            </thead>
            <tbody>
              {[
                { stage: 'Requests', count: funnel.requests },
                { stage: 'Needed a question back', count: funnel.clarified },
                { stage: 'Got options', count: funnel.suggested },
                { stage: 'Approved one', count: funnel.approved },
                { stage: 'Confirmed by the venue', count: funnel.confirmed },
                { stage: 'Actually went', count: funnel.completed },
              ].map((row) => (
                <tr key={row.stage} className="border-b last:border-0">
                  <td className="px-4 py-2.5">{row.stage}</td>
                  <td className="px-4 py-2.5 tabular-nums">{row.count}</td>
                  <td className="px-4 py-2.5 tabular-nums text-muted-foreground">
                    {funnel.requests > 0
                      ? `${Math.round((100 * row.count) / funnel.requests)}%`
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium uppercase tracking-widest text-muted-foreground">
          Time to confirmation, by rail
        </h2>
        {s.timings.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            No confirmations in this period yet.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/50 text-left">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Rail</th>
                  <th className="px-4 py-2.5 font-medium">Bookings</th>
                  <th className="px-4 py-2.5 font-medium">Median</th>
                  <th className="px-4 py-2.5 font-medium">p90</th>
                  <th className="px-4 py-2.5 font-medium">Target</th>
                </tr>
              </thead>
              <tbody>
                {s.timings.map((t) => {
                  const met = t.median_minutes !== null && t.median_minutes <= t.target_minutes;
                  return (
                    <tr key={t.rail} className="border-b last:border-0">
                      <td className="px-4 py-2.5">{t.rail}</td>
                      <td className="px-4 py-2.5 tabular-nums">{t.bookings}</td>
                      <td className={`px-4 py-2.5 tabular-nums ${met ? '' : 'text-destructive'}`}>
                        {t.median_minutes ?? '—'} min
                      </td>
                      <td className="px-4 py-2.5 tabular-nums text-muted-foreground">
                        {t.p90_minutes ?? '—'} min
                      </td>
                      <td className="px-4 py-2.5 tabular-nums text-muted-foreground">
                        ≤ {t.target_minutes} min
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium uppercase tracking-widest text-muted-foreground">
          Ops minutes per booking
        </h2>
        <p className="text-sm text-muted-foreground">
          The number that decides whether this is a business. It should fall week on week as the
          rails take over from a person.
        </p>
        {s.effort.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            No bookings in this period yet.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/50 text-left">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Week</th>
                  <th className="px-4 py-2.5 font-medium">Bookings</th>
                  <th className="px-4 py-2.5 font-medium">Ops tasks</th>
                  <th className="px-4 py-2.5 font-medium">Per booking</th>
                  <th className="px-4 py-2.5 font-medium">Median open</th>
                </tr>
              </thead>
              <tbody>
                {s.effort.map((row) => (
                  <tr key={row.week} className="border-b last:border-0">
                    <td className="px-4 py-2.5">
                      {new Date(row.week).toLocaleDateString('en-GB', {
                        day: 'numeric',
                        month: 'short',
                      })}
                    </td>
                    <td className="px-4 py-2.5 tabular-nums">{row.bookings}</td>
                    <td className="px-4 py-2.5 tabular-nums">{row.ops_tasks}</td>
                    <td className="px-4 py-2.5 tabular-nums">{row.tasks_per_booking ?? '—'}</td>
                    <td className="px-4 py-2.5 tabular-nums text-muted-foreground">
                      {row.median_open_minutes ?? '—'} min
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium uppercase tracking-widest text-muted-foreground">
          Venue reliability
        </h2>
        {s.venues.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            No bookings against any venue yet.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/50 text-left">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Venue</th>
                  <th className="px-4 py-2.5 font-medium">Bookings</th>
                  <th className="px-4 py-2.5 font-medium">Confirmed</th>
                  <th className="px-4 py-2.5 font-medium">Failed</th>
                  <th className="px-4 py-2.5 font-medium">Not there on arrival</th>
                  <th className="px-4 py-2.5 font-medium">Median reply</th>
                </tr>
              </thead>
              <tbody>
                {s.venues.map((v) => (
                  <tr key={v.venue_id} className="border-b last:border-0">
                    <td className="px-4 py-2.5">
                      <Link href={`/venues/${v.venue_id}`} className="hover:underline">
                        {v.venue_name}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 tabular-nums">{v.bookings}</td>
                    <td className="px-4 py-2.5 tabular-nums">{v.confirmed}</td>
                    <td className="px-4 py-2.5 tabular-nums">{v.failed}</td>
                    <td className="px-4 py-2.5">
                      {v.no_show_at_venue > 0 ? (
                        <Badge variant="destructive">{v.no_show_at_venue}</Badge>
                      ) : (
                        <span className="tabular-nums text-muted-foreground">0</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 tabular-nums text-muted-foreground">
                      {v.median_response_minutes ?? '—'} min
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="text-xs text-muted-foreground">
        Since {new Date(s.since).toLocaleDateString('en-GB')}. Retention and venue reliability are
        measured over the whole pilot regardless of the range above, because both need time to mean
        anything.
      </p>
    </main>
  );
}
