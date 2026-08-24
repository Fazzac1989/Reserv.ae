'use client';

import { useState, useTransition } from 'react';
import { Check, ShieldCheck } from 'lucide-react';
import { recordBookingConsent, setOnboardingStatus } from '../../lib/venues/actions';
import { ONBOARDING_STATUSES, type OnboardingStatus } from '../../lib/venues/constants';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';

/**
 * The onboarding pipeline control, plus the consent gate that stands in front
 * of `live`.
 *
 * Consent is recorded as its own act rather than folded into the status change:
 * the database refuses `live` without it, and the pilot's legal position rests
 * on being able to say when each venue agreed and who agreed.
 */
export function StatusControl({
  venueId,
  status,
  consentAt,
}: {
  venueId: string;
  status: OnboardingStatus;
  consentAt: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [consentNote, setConsentNote] = useState('');
  const [showConsent, setShowConsent] = useState(false);

  function change(next: OnboardingStatus) {
    if (next === status) return;
    setError(null);
    startTransition(async () => {
      const result = await setOnboardingStatus(venueId, next);
      if (!result.ok) setError(result.message);
    });
  }

  function saveConsent() {
    setError(null);
    startTransition(async () => {
      const result = await recordBookingConsent(venueId, consentNote);
      if (result.ok) {
        setShowConsent(false);
        setConsentNote('');
      } else {
        setError(result.message);
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-1.5">
        {ONBOARDING_STATUSES.map((option) => (
          <Button
            key={option}
            size="sm"
            variant={option === status ? 'default' : 'outline'}
            disabled={pending}
            onClick={() => change(option)}
          >
            {option === status ? <Check /> : null}
            {option}
          </Button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        {consentAt ? (
          <>
            <Badge variant="secondary">
              <ShieldCheck className="mr-1 h-3 w-3" />
              consent recorded
            </Badge>
            <span className="text-muted-foreground">
              {new Date(consentAt).toLocaleDateString('en-GB', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              })}
            </span>
          </>
        ) : showConsent ? (
          <div className="flex w-full flex-wrap items-center gap-2">
            <Input
              value={consentNote}
              onChange={(e) => setConsentNote(e.target.value)}
              placeholder="Who agreed, and how — e.g. 'Manager agreed in person, 14 Feb'"
              className="min-w-64 flex-1"
            />
            <Button size="sm" onClick={saveConsent} disabled={pending}>
              Record consent
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowConsent(false)}>
              Cancel
            </Button>
          </div>
        ) : (
          <>
            <Badge variant="outline">no booking consent</Badge>
            <Button size="sm" variant="outline" onClick={() => setShowConsent(true)}>
              Record consent
            </Button>
            <span className="text-muted-foreground">Required before this venue can go live.</span>
          </>
        )}
      </div>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
