import Link from 'next/link';
import { requireVenueMember } from '../../../lib/partner-auth';
import { SignOutButton } from '../../../components/sign-out-button';

const NAV = [
  { href: '/partner', label: 'Bookings' },
  { href: '/partner/listing', label: 'Your listing' },
];

/**
 * The partner shell.
 *
 * A separate route group from `(console)` rather than a conditional inside it,
 * because the two have different gates. Sharing one layout would mean one
 * `if` standing between a venue and every other venue's data, and that `if`
 * would eventually be edited by somebody who did not know what it was holding
 * up. Here the wrong gate is a missing import, not a wrong branch.
 */
export default async function PartnerLayout({ children }: { children: React.ReactNode }) {
  const partner = await requireVenueMember();

  return (
    <div className="min-h-screen">
      <header className="border-b">
        <div className="mx-auto flex max-w-4xl items-center gap-6 px-6 py-3">
          <Link href="/partner" className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
            Reserv
          </Link>
          <nav className="flex items-center gap-4">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <span className="hidden text-sm text-muted-foreground sm:inline">
              {partner.fullName ?? partner.email}
            </span>
            <SignOutButton />
          </div>
        </div>
      </header>
      {children}
    </div>
  );
}
