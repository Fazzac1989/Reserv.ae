import { requireVenueMember, selectVenue } from '../../../lib/partner-auth';
import { getVenueBook, type VenueBooking } from '../../../lib/partners/bookings';
import { VenueSwitcher } from '../../../components/partner/venue-switcher';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../../components/ui/card';
import { Badge } from '../../../components/ui/badge';

export const dynamic = 'force-dynamic';

function when(iso: string): string {
  const at = new Date(iso);
  return at.toLocaleString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function cover(size: number): string {
  return size === 1 ? '1 cover' : `${size} covers`;
}

/**
 * One booking, as a host would read it: when, how many, who, and anything
 * asked for. The guest's name is the only personal detail here, and there is
 * deliberately no way to contact them from this screen.
 */
function BookingRow({ booking }: { booking: VenueBooking }) {
  return (
    <li className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b py-3 last:border-b-0">
      <span className="min-w-[10.5rem] font-medium tabular-nums">
        {when(booking.scheduled_for!)}
      </span>
      <span className="text-muted-foreground">{cover(booking.party_size!)}</span>
      <span className="font-medium">{booking.guest_name}</span>
      {booking.service_name ? (
        <span className="text-muted-foreground">· {booking.service_name}</span>
      ) : null}
      {booking.special_requests ? (
        <span className="w-full text-sm text-muted-foreground">{booking.special_requests}</span>
      ) : null}
    </li>
  );
}

function Book({
  title,
  description,
  bookings,
  empty,
}: {
  title: string;
  description: string;
  bookings: VenueBooking[];
  empty: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-3">
          {title}
          {bookings.length > 0 ? <Badge variant="muted">{bookings.length}</Badge> : null}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {bookings.length === 0 ? (
          <p className="text-sm text-muted-foreground">{empty}</p>
        ) : (
          <ul className="flex flex-col">
            {bookings.map((booking) => (
              <BookingRow key={booking.id} booking={booking} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export default async function PartnerBookingsPage({
  searchParams,
}: {
  searchParams: Promise<{ venue?: string }>;
}) {
  const partner = await requireVenueMember();
  const { venue: requested } = await searchParams;
  const venue = selectVenue(partner, requested);

  const book = await getVenueBook(venue.id);

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 px-6 py-10">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-medium tracking-tight">{venue.name}</h1>
        <VenueSwitcher venues={partner.venues} current={venue.id} basePath="/partner" />
      </header>

      <Book
        title="Upcoming"
        description="Confirmed. The guest has been told they have this table."
        bookings={book.upcoming}
        empty="Nothing booked yet."
      />

      <Book
        title="Being arranged"
        description="Reserv has asked for these and is waiting on an answer. Nobody has been promised a table."
        bookings={book.awaiting}
        empty="Nothing in progress."
      />

      <Book
        title="Earlier"
        description="Past, cancelled and abandoned."
        bookings={book.past}
        empty="Nothing yet."
      />
    </main>
  );
}
