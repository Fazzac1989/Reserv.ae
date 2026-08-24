import Link from 'next/link';
import { requireOps } from '../../lib/auth';
import { createClient } from '../../lib/supabase/server';
import { countByStatus } from '../../lib/venues/queries';
import { PIPELINE } from '../../lib/venues/constants';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';

export const dynamic = 'force-dynamic';

/** Pilot targets from the build plan, so progress is legible without a spreadsheet. */
const TARGETS = { venues: 50, apiBookable: 20, whatsappResponsive: 20 };

export default async function ConsoleHome() {
  const user = await requireOps();
  const supabase = await createClient();

  const [byStatus, channels, openTasks] = await Promise.all([
    countByStatus(),
    supabase.from('venue_booking_channels').select('kind, is_enabled, venue_id'),
    supabase
      .from('ops_tasks')
      .select('id', { count: 'exact', head: true })
      .in('status', ['open', 'in_progress']),
  ]);

  const rows = channels.data ?? [];
  const apiVenues = new Set(rows.filter((c) => c.kind === 'api').map((c) => c.venue_id)).size;
  const whatsappVenues = new Set(rows.filter((c) => c.kind === 'whatsapp').map((c) => c.venue_id))
    .size;
  const live = byStatus.live;

  const progress = [
    { label: 'Venues onboarded', value: live, target: TARGETS.venues },
    { label: 'API-bookable', value: apiVenues, target: TARGETS.apiBookable },
    { label: 'WhatsApp reachable', value: whatsappVenues, target: TARGETS.whatsappResponsive },
  ];

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-8 px-6 py-10">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-medium tracking-tight">Overview</h1>
        <p className="text-sm text-muted-foreground">Signed in as {user.fullName ?? user.email}</p>
      </header>

      <section className="grid gap-3 sm:grid-cols-3">
        {progress.map((item) => (
          <Card key={item.label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-muted-foreground">{item.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-medium tabular-nums">
                {item.value}
                <span className="text-base text-muted-foreground"> / {item.target}</span>
              </p>
              <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-primary"
                  style={{ width: `${Math.min(100, (item.value / item.target) * 100)}%` }}
                />
              </div>
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium uppercase tracking-widest text-muted-foreground">
          Acquisition pipeline
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {PIPELINE.map((status) => (
            <Link
              key={status}
              href={`/venues?status=${status}`}
              className="rounded-lg border p-4 transition-colors hover:bg-accent"
            >
              <p className="text-2xl font-medium tabular-nums">{byStatus[status]}</p>
              <p className="mt-1 text-xs uppercase tracking-widest text-muted-foreground">
                {status}
              </p>
            </Link>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium uppercase tracking-widest text-muted-foreground">
          Ops queue
        </h2>
        <p className="text-sm text-muted-foreground">
          {openTasks.count ?? 0} open. The booking queue itself arrives in Phase 5, when the manual
          rail becomes the pilot&apos;s first end-to-end path.
        </p>
      </section>
    </main>
  );
}
