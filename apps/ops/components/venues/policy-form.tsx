'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { upsertPolicy } from '../../lib/venues/actions';
import type { VenuePolicy } from '../../lib/venues/queries';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { Field } from './field';
import { formDefaults } from './use-form-defaults';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? 'Saving…' : 'Save policy'}
    </Button>
  );
}

/**
 * The venue's rules, as the Curator will apply them.
 *
 * These are deterministic filters, not hints: a suggestion outside the lead
 * time or party-size range is never shown, so getting them wrong quietly
 * removes a venue from consideration.
 */
export function PolicyForm({ venueId, policy }: { venueId: string; policy: VenuePolicy | null }) {
  const [state, formAction] = useActionState(upsertPolicy.bind(null, venueId), null);
  const d = formDefaults(state);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field>
          <Label htmlFor="min_lead_time_minutes">
            Minimum notice
            <span className="ml-2 font-normal text-muted-foreground">minutes</span>
          </Label>
          <Input
            id="min_lead_time_minutes"
            name="min_lead_time_minutes"
            type="number"
            min={0}
            max={20160}
            defaultValue={d.text('min_lead_time_minutes', policy?.min_lead_time_minutes ?? 120)}
          />
        </Field>

        <Field>
          <Label htmlFor="max_lead_time_days">
            Books ahead
            <span className="ml-2 font-normal text-muted-foreground">days</span>
          </Label>
          <Input
            id="max_lead_time_days"
            name="max_lead_time_days"
            type="number"
            min={0}
            max={365}
            defaultValue={d.text('max_lead_time_days', policy?.max_lead_time_days ?? 60)}
          />
        </Field>

        <Field>
          <Label htmlFor="min_party_size">Minimum party size</Label>
          <Input
            id="min_party_size"
            name="min_party_size"
            type="number"
            min={1}
            max={50}
            defaultValue={d.text('min_party_size', policy?.min_party_size ?? 1)}
          />
        </Field>

        <Field>
          <Label htmlFor="max_party_size">Maximum party size</Label>
          <Input
            id="max_party_size"
            name="max_party_size"
            type="number"
            min={1}
            max={200}
            defaultValue={d.text('max_party_size', policy?.max_party_size ?? 12)}
          />
        </Field>

        <Field>
          <Label htmlFor="cancellation_notice_hours">
            Cancellation notice
            <span className="ml-2 font-normal text-muted-foreground">hours</span>
          </Label>
          <Input
            id="cancellation_notice_hours"
            name="cancellation_notice_hours"
            type="number"
            min={0}
            max={336}
            defaultValue={d.text(
              'cancellation_notice_hours',
              policy?.cancellation_notice_hours ?? 0,
            )}
          />
        </Field>

        <label className="flex items-center gap-2 self-end text-sm">
          <input
            type="checkbox"
            name="requires_deposit"
            defaultChecked={d.checked('requires_deposit', policy?.requires_deposit ?? false)}
          />
          Requires a deposit
        </label>

        <Field className="sm:col-span-2">
          <Label htmlFor="cancellation_terms">Cancellation terms</Label>
          <Textarea
            id="cancellation_terms"
            name="cancellation_terms"
            defaultValue={d.text('cancellation_terms', policy?.cancellation_terms)}
            maxLength={1000}
            placeholder="24 hours notice, otherwise the table is released."
          />
        </Field>

        <Field className="sm:col-span-2">
          <Label htmlFor="notes">Notes</Label>
          <Textarea
            id="notes"
            name="notes"
            defaultValue={d.text('notes', policy?.notes)}
            maxLength={2000}
            placeholder="Blackout on Friday brunch. No agent bookings during Ramadan evenings."
          />
        </Field>
      </div>

      {state && !state.ok ? (
        <p role="alert" className="text-sm text-destructive">
          {state.message}
        </p>
      ) : null}
      {state?.ok ? <p className="text-sm text-muted-foreground">Saved.</p> : null}

      <div>
        <SubmitButton />
      </div>
    </form>
  );
}
