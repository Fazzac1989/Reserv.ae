import { notFound } from 'next/navigation';
import { requireVenueMember, selectVenue } from '../../../../lib/partner-auth';
import { getPartnerVenue } from '../../../../lib/partners/bookings';
import { ListingForm } from '../../../../components/partner/listing-form';
import { VenueSwitcher } from '../../../../components/partner/venue-switcher';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../../../components/ui/card';

export const dynamic = 'force-dynamic';

const STATUS_NOTE: Record<string, string> = {
  live: 'Your listing is visible in the app and Reserv can take bookings for you.',
  agreed: 'Agreed with Reserv. It goes live once we have finished setting it up.',
  contacted: 'Not visible in the app yet.',
  lead: 'Not visible in the app yet.',
  paused: 'Paused. Nobody can book you through Reserv at the moment.',
  lost: 'Not currently listed.',
};

export default async function PartnerListingPage({
  searchParams,
}: {
  searchParams: Promise<{ venue?: string }>;
}) {
  const partner = await requireVenueMember();
  const { venue: requested } = await searchParams;
  const selected = selectVenue(partner, requested);

  const venue = await getPartnerVenue(selected.id);
  if (!venue) notFound();

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 px-6 py-10">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-medium tracking-tight">{venue.name}</h1>
        <p className="text-sm text-muted-foreground">
          {STATUS_NOTE[venue.onboarding_status] ?? 'Not currently listed.'}
        </p>
        <VenueSwitcher venues={partner.venues} current={venue.id} basePath="/partner/listing" />
      </header>

      <Card>
        <CardHeader>
          <CardTitle>How you are described</CardTitle>
          <CardDescription>
            This is what people read before they book. Changes are live straight away.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ListingForm venue={venue} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Set by Reserv</CardTitle>
          <CardDescription>
            Ask us and we will change any of these. They decide which searches you appear in, so
            they are not editable here.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            {[
              ['Name', venue.name],
              ['Type', venue.vertical],
              ['Area', venue.zone.replace(/_/g, ' ')],
              ['Price band', `${venue.price_band} of 4`],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="font-medium">{value}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>
    </main>
  );
}
