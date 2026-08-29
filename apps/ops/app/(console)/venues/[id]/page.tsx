import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { requireOps } from '../../../../lib/auth';
import { getVenue, listChoices } from '../../../../lib/venues/queries';
import { updateVenue } from '../../../../lib/venues/actions';
import { labelFor } from '../../../../lib/venues/constants';
import { VenueForm } from '../../../../components/venues/venue-form';
import { StatusControl } from '../../../../components/venues/status-control';
import { ChannelEditor } from '../../../../components/venues/channel-editor';
import { PolicyForm } from '../../../../components/venues/policy-form';
import { ContactList } from '../../../../components/venues/contact-list';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../../../components/ui/card';
import { Badge } from '../../../../components/ui/badge';

export const dynamic = 'force-dynamic';

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export default async function VenuePage({ params }: { params: Promise<{ id: string }> }) {
  await requireOps();
  const { id } = await params;

  const [detail, choices] = await Promise.all([getVenue(id), listChoices()]);
  if (!detail) notFound();

  const { venue, channels, policy, contacts, events } = detail;

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 px-6 py-10">
      <Link
        href="/venues"
        className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" />
        Venues
      </Link>

      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-medium tracking-tight">{venue.name}</h1>
          {venue.is_demo ? <Badge variant="muted">demo</Badge> : null}
        </div>
        <p className="text-sm text-muted-foreground">
          {venue.vertical} · {labelFor(venue.zone)} · band {venue.price_band}
          {venue.address ? ` · ${venue.address}` : ''}
        </p>
      </header>

      <Section
        title="Onboarding"
        description="Where this venue is in the acquisition pipeline, and whether it has agreed we may book on a user's behalf."
      >
        <StatusControl
          venueId={venue.id}
          status={venue.onboarding_status}
          consentAt={venue.booking_consent_obtained_at}
        />
      </Section>

      <Section
        title="Booking channels"
        description="The fallback chain, in priority order. The rail selector walks this list top to bottom and skips anything disabled."
      >
        <ChannelEditor venueId={venue.id} channels={channels} />
      </Section>

      <Section
        title="Policies"
        description="Deterministic filters the Curator applies before an LLM ever ranks this venue."
      >
        <PolicyForm venueId={venue.id} policy={policy} />
      </Section>

      <Section
        title="Contacts"
        description="Named people at the venue. Visible to ops only, and never seeded into the repository."
      >
        <ContactList venueId={venue.id} contacts={contacts} />
      </Section>

      <Section title="Details" description="Everything the Curator reads when ranking this venue.">
        <VenueForm
          venue={venue}
          action={updateVenue.bind(null, venue.id)}
          submitLabel="Save changes"
          categories={choices.categories}
          places={choices.places}
        />
      </Section>

      <Section
        title="History"
        description="Append-only. Every change ops makes here is recorded against the venue."
      >
        {events.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing recorded yet.</p>
        ) : (
          <ul className="flex flex-col gap-2 text-sm">
            {events.map((event) => (
              <li key={event.id} className="flex flex-wrap items-baseline gap-2">
                <span className="tabular-nums text-muted-foreground">
                  {new Date(event.occurred_at).toLocaleString('en-GB', {
                    day: 'numeric',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
                <span className="font-medium">{labelFor(event.event)}</span>
                {event.reason ? (
                  <span className="text-muted-foreground">— {event.reason}</span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Section>
    </main>
  );
}
