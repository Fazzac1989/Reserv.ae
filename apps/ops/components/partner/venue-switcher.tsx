import Link from 'next/link';
import type { PartnerVenue } from '../../lib/partner-auth';

/**
 * Only rendered by someone who manages more than one venue, which most
 * partners never will. Plain links rather than a select so the current venue
 * is in the URL and a bookmark keeps working.
 */
export function VenueSwitcher({
  venues,
  current,
  basePath,
}: {
  venues: PartnerVenue[];
  current: string;
  basePath: string;
}) {
  if (venues.length < 2) return null;

  return (
    <nav className="flex flex-wrap items-center gap-3 text-sm">
      {venues.map((venue) => (
        <Link
          key={venue.id}
          href={`${basePath}?venue=${venue.id}`}
          aria-current={venue.id === current ? 'page' : undefined}
          className={
            venue.id === current
              ? 'font-medium text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          }
        >
          {venue.name}
        </Link>
      ))}
    </nav>
  );
}
