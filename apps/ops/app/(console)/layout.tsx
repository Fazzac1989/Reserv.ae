import Link from 'next/link';
import { requireOps } from '../../lib/auth';
import { SignOutButton } from '../../components/sign-out-button';

const NAV = [
  { href: '/', label: 'Overview' },
  { href: '/venues', label: 'Venues' },
  { href: '/bookings', label: 'Bookings' },
  { href: '/messages', label: 'Approvals' },
  { href: '/metrics', label: 'Metrics' },
];

export default async function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const user = await requireOps();

  return (
    <div className="min-h-screen">
      <header className="border-b">
        <div className="mx-auto flex max-w-6xl items-center gap-6 px-6 py-3">
          <Link href="/" className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
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
              {user.fullName ?? user.email}
            </span>
            <SignOutButton />
          </div>
        </div>
      </header>
      {children}
    </div>
  );
}
