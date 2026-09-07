'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { updateListing } from '../../lib/partners/listing-actions';
import type { PartnerVenueRow } from '../../lib/partners/bookings';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { Field } from '../venues/field';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? 'Saving…' : 'Save'}
    </Button>
  );
}

/**
 * The four things a venue owns about its own listing.
 *
 * Only these four are submitted. The database refuses the rest regardless —
 * see the column guard — but a form that offers a field and then rejects it
 * is a worse experience than one that never offered it, so the split is
 * visible in the UI as well as enforced underneath.
 */
export function ListingForm({ venue }: { venue: PartnerVenueRow }) {
  const [state, formAction] = useActionState(updateListing.bind(null, venue.id), null);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <Field>
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          name="description"
          rows={4}
          defaultValue={venue.description ?? ''}
          placeholder="What someone should know before they walk in."
        />
      </Field>

      <Field>
        <Label htmlFor="address">Address</Label>
        <Input id="address" name="address" defaultValue={venue.address ?? ''} />
      </Field>

      <Field>
        <Label htmlFor="tags">
          Tags <span className="font-normal text-muted-foreground">comma separated</span>
        </Label>
        <Input
          id="tags"
          name="tags"
          defaultValue={(venue.tags ?? []).join(', ')}
          placeholder="italian, terrace, wine list"
        />
      </Field>

      <Field>
        <Label htmlFor="best_times">
          Best times <span className="font-normal text-muted-foreground">comma separated</span>
        </Label>
        <Input
          id="best_times"
          name="best_times"
          defaultValue={(venue.best_times ?? []).join(', ')}
          placeholder="early evening, sunset, late lunch"
        />
      </Field>

      {state ? (
        <p className={state.ok ? 'text-sm text-muted-foreground' : 'text-sm text-destructive'}>
          {state.ok ? 'Saved.' : state.message}
        </p>
      ) : null}

      <div>
        <SubmitButton />
      </div>
    </form>
  );
}
