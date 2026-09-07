'use client';

import { useState, useTransition } from 'react';
import { BadgeCheck, CircleAlert } from 'lucide-react';
import { unverifyVenue, verifyVenue } from '../../lib/venues/actions';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';

/**
 * Whether a human has checked this listing against the venue.
 *
 * Separate from onboarding status and from booking consent, because it answers
 * a different question. Consent is "may we book on their behalf"; onboarding
 * is "are we live with them"; this is "is what we are telling people about
 * them actually true". A venue can be live, consented and still describe
 * itself from a spreadsheet nobody checked.
 *
 * It matters because the app leans on it. Until this is set, every profile
 * says "not yet confirmed with the venue" and every fact read off the record
 * carries a caveat. Setting it is what makes the app stop hedging — which is
 * exactly why it takes a note and an explicit act rather than a checkbox.
 */
export function VerificationControl({
  venueId,
  verifiedAt,
}: {
  venueId: string;
  verifiedAt: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [open, setOpen] = useState(false);

  const verified = Boolean(verifiedAt);

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = verified
        ? await unverifyVenue(venueId, note)
        : await verifyVenue(venueId, note);
      if (result.ok) {
        setOpen(false);
        setNote('');
      } else {
        setError(result.message);
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {verified ? (
          <Badge variant="secondary" className="gap-1.5">
            <BadgeCheck className="h-3.5 w-3.5" />
            Checked {new Date(verifiedAt!).toLocaleDateString('en-GB')}
          </Badge>
        ) : (
          <Badge variant="outline" className="gap-1.5 text-muted-foreground">
            <CircleAlert className="h-3.5 w-3.5" />
            Never checked with the venue
          </Badge>
        )}

        <Button variant="ghost" size="sm" onClick={() => setOpen((o) => !o)} disabled={pending}>
          {verified ? 'Withdraw' : 'Mark as checked'}
        </Button>
      </div>

      {!verified && !open ? (
        <p className="text-sm text-muted-foreground">
          Every profile for this venue tells users it has not been confirmed, and every answer
          about it is hedged. That is correct until somebody checks.
        </p>
      ) : null}

      {open ? (
        <div className="flex flex-col gap-2">
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={
              verified
                ? 'What changed — new management, hours moved, policy no longer right'
                : 'Who confirmed it and how — "Fatima, reservations, by phone 8 Sep"'
            }
            disabled={pending}
          />
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={submit} disabled={pending || note.trim().length < 3}>
              {verified ? 'Withdraw verification' : 'Record it'}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
