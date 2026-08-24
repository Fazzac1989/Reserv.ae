import { requireOps } from '../../../lib/auth';
import { listPendingMessages } from '../../../lib/whatsapp/queries';
import { agentServiceUrl } from '../../../lib/env';
import { ApprovalCard } from '../../../components/whatsapp/approval-card';

export const dynamic = 'force-dynamic';

/** Asks the service what is actually switched on, so the page can say so. */
async function railStatus(): Promise<{ available: boolean; reason: string | null }> {
  try {
    const response = await fetch(`${agentServiceUrl}/capabilities`, { cache: 'no-store' });
    if (!response.ok) return { available: false, reason: 'The agent service is not answering.' };
    const body = (await response.json()) as {
      whatsapp_rail?: boolean;
      whatsapp_unavailable_reason?: string | null;
    };
    return {
      available: body.whatsapp_rail === true,
      reason: body.whatsapp_unavailable_reason ?? null,
    };
  } catch {
    return { available: false, reason: 'The agent service is not reachable.' };
  }
}

export default async function MessagesPage() {
  await requireOps();
  const [pending, rail] = await Promise.all([listPendingMessages(), railStatus()]);

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-10">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-medium tracking-tight">Outbound approvals</h1>
        <p className="text-sm text-muted-foreground">
          Every venue starts with approval required. Nothing reaches a venue until someone here has
          read it.
        </p>
      </header>

      {/*
        Principle 4, on the page. If the rail is off, say so plainly rather than
        showing an approve button that would fail on click.
      */}
      {!rail.available ? (
        <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">The WhatsApp rail is not live.</span>{' '}
          {rail.reason ?? 'It is switched off in this environment.'} Drafts can still be reviewed
          here, but approving one will not send it until the rail is configured.
        </p>
      ) : null}

      {pending.length === 0 ? (
        <p className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
          Nothing waiting. Drafts appear here when a booking reaches a WhatsApp venue.
        </p>
      ) : (
        <ul className="flex flex-col gap-4">
          {pending.map((message) => (
            <ApprovalCard key={message.id} message={message} />
          ))}
        </ul>
      )}
    </main>
  );
}
