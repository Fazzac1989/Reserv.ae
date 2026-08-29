'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import type { ActionResult } from '../../lib/venues/actions';
import type { Venue } from '../../lib/venues/queries';
import type { Choice } from '../../lib/venues/constants';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { Field } from './field';
import { formDefaults } from './use-form-defaults';

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? 'Saving…' : label}
    </Button>
  );
}

const PRICE_BANDS = [
  { value: 1, label: '1 — everyday' },
  { value: 2, label: '2 — mid' },
  { value: 3, label: '3 — upmarket' },
  { value: 4, label: '4 — special occasion' },
];

/**
 * Create and edit share this form. Native `select` rather than the Radix one:
 * these live inside an uncontrolled form posting FormData, and a native control
 * submits its value without a hidden-input dance.
 */
export function VenueForm({
  venue,
  action,
  submitLabel,
  categories,
  places,
}: {
  venue?: Venue;
  action: (prev: ActionResult | null, formData: FormData) => Promise<ActionResult>;
  submitLabel: string;
  /** From the database, so a category added today is selectable today. */
  categories: readonly Choice[];
  places: readonly Choice[];
}) {
  const [state, formAction] = useActionState(action, null);
  const d = formDefaults(state);

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <Field className="sm:col-span-2">
          <Label htmlFor="name">Name</Label>
          <Input
            id="name"
            name="name"
            defaultValue={d.text('name', venue?.name)}
            required
            maxLength={160}
          />
        </Field>

        <Field>
          <Label htmlFor="vertical">Vertical</Label>
          <select
            id="vertical"
            name="vertical"
            defaultValue={d.text('vertical', venue?.vertical ?? categories[0]?.slug)}
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
          >
            {categories.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.label}
              </option>
            ))}
          </select>
        </Field>

        <Field>
          <Label htmlFor="zone">Zone</Label>
          <select
            id="zone"
            name="zone"
            defaultValue={d.text('zone', venue?.zone ?? places[0]?.slug)}
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
          >
            {places.map((p) => (
              <option key={p.slug} value={p.slug}>
                {p.label}
              </option>
            ))}
          </select>
        </Field>

        <Field>
          <Label htmlFor="price_band">Price band</Label>
          <select
            id="price_band"
            name="price_band"
            defaultValue={d.text('price_band', String(venue?.price_band ?? 2))}
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
          >
            {PRICE_BANDS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </Field>

        <Field>
          <Label htmlFor="address">Address</Label>
          <Input
            id="address"
            name="address"
            defaultValue={d.text('address', venue?.address)}
            maxLength={300}
          />
        </Field>

        <Field>
          <Label htmlFor="lat">Latitude</Label>
          <Input
            id="lat"
            name="lat"
            type="number"
            step="any"
            defaultValue={d.text('lat', venue?.lat)}
            placeholder="25.0805"
          />
        </Field>

        <Field>
          <Label htmlFor="lng">Longitude</Label>
          <Input
            id="lng"
            name="lng"
            type="number"
            step="any"
            defaultValue={d.text('lng', venue?.lng)}
            placeholder="55.1403"
          />
        </Field>

        <Field className="sm:col-span-2">
          <Label htmlFor="tags">
            Tags
            <span className="ml-2 font-normal text-muted-foreground">
              cuisines for restaurants, services for salons — comma separated
            </span>
          </Label>
          <Input
            id="tags"
            name="tags"
            defaultValue={d.text('tags', (venue?.tags ?? []).join(', '))}
            placeholder="japanese, sushi, omakase"
          />
        </Field>

        <Field className="sm:col-span-2">
          <Label htmlFor="best_times">
            Best times
            <span className="ml-2 font-normal text-muted-foreground">comma separated</span>
          </Label>
          <Input
            id="best_times"
            name="best_times"
            defaultValue={d.text('best_times', (venue?.best_times ?? []).join(', '))}
            placeholder="early evening, weeknights"
          />
        </Field>

        <Field className="sm:col-span-2">
          <Label htmlFor="photo_urls">
            Photographs
            <span className="ml-2 font-normal text-muted-foreground">
              image links, comma separated — the first is the one the app shows
            </span>
          </Label>
          <Input
            id="photo_urls"
            name="photo_urls"
            defaultValue={d.text('photo_urls', (venue?.photo_urls ?? []).join(', '))}
            placeholder="https://…/dining-room.jpg, https://…/terrace.jpg"
          />
        </Field>

        <Field className="sm:col-span-2">
          <Label htmlFor="house_note">
            House note
            <span className="ml-2 font-normal text-muted-foreground">
              our opinion — the Curator may quote this to a user
            </span>
          </Label>
          <Textarea
            id="house_note"
            name="house_note"
            defaultValue={d.text('house_note', venue?.house_note)}
            maxLength={500}
            placeholder="Corner tables on the terrace are the only ones worth having."
          />
        </Field>

        <Field className="sm:col-span-2">
          <Label htmlFor="description">Description</Label>
          <Textarea
            id="description"
            name="description"
            defaultValue={d.text('description', venue?.description)}
            maxLength={2000}
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
        <SubmitButton label={submitLabel} />
      </div>
    </form>
  );
}
