'use client';

import { useActionState, useState, useTransition } from 'react';
import { useFormStatus } from 'react-dom';
import { Trash2 } from 'lucide-react';
import { createContact, deleteContact } from '../../lib/venues/actions';
import type { VenueContact } from '../../lib/venues/queries';
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
      {pending ? 'Adding…' : 'Add contact'}
    </Button>
  );
}

/**
 * Named people at the venue.
 *
 * This is the part of the CRM that is genuinely the moat and genuinely
 * sensitive: RLS keeps it ops-only, and nothing here is ever seeded into the
 * repository.
 */
export function ContactList({ venueId, contacts }: { venueId: string; contacts: VenueContact[] }) {
  const [state, formAction] = useActionState(createContact.bind(null, venueId), null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const d = formDefaults(state);

  function remove(contactId: string) {
    setError(null);
    startTransition(async () => {
      const result = await deleteContact(venueId, contactId);
      if (!result.ok) setError(result.message);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {contacts.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No named contact yet. A named person is what makes the WhatsApp rail work.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {contacts.map((contact) => (
            <li key={contact.id} className="flex items-start gap-3 rounded-lg border px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="font-medium">
                  {contact.name}
                  {contact.role ? (
                    <span className="ml-2 font-normal text-muted-foreground">{contact.role}</span>
                  ) : null}
                </p>
                <p className="truncate text-sm text-muted-foreground">
                  {[contact.phone_e164, contact.email].filter(Boolean).join(' · ')}
                </p>
                {contact.notes ? (
                  <p className="mt-1 text-sm text-muted-foreground">{contact.notes}</p>
                ) : null}
              </div>
              <Button
                size="icon"
                variant="ghost"
                aria-label={`Delete contact ${contact.name}`}
                disabled={pending}
                onClick={() => remove(contact.id)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {adding ? (
        <form action={formAction} className="flex flex-col gap-4 rounded-lg border bg-muted/30 p-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <Label htmlFor="contact-name">Name</Label>
              <Input
                id="contact-name"
                name="name"
                required
                maxLength={120}
                defaultValue={d.text('name', '')}
              />
            </Field>
            <Field>
              <Label htmlFor="contact-role">Role</Label>
              <Input
                id="contact-role"
                name="role"
                placeholder="Reservations manager"
                defaultValue={d.text('role', '')}
              />
            </Field>
            <Field>
              <Label htmlFor="contact-phone">Phone</Label>
              <Input
                id="contact-phone"
                name="phone_e164"
                placeholder="+9715XXXXXXX"
                defaultValue={d.text('phone_e164', '')}
              />
            </Field>
            <Field>
              <Label htmlFor="contact-email">Email</Label>
              <Input
                id="contact-email"
                name="email"
                type="email"
                defaultValue={d.text('email', '')}
              />
            </Field>
            <Field className="sm:col-span-2">
              <Label htmlFor="contact-notes">Notes</Label>
              <Textarea
                id="contact-notes"
                name="notes"
                maxLength={2000}
                placeholder="Best reached after 4pm. Prefers WhatsApp to email."
                defaultValue={d.text('notes', '')}
              />
            </Field>
          </div>

          {state && !state.ok ? (
            <p role="alert" className="text-sm text-destructive">
              {state.message}
            </p>
          ) : null}

          <div className="flex gap-2">
            <SubmitButton />
            <Button type="button" size="sm" variant="ghost" onClick={() => setAdding(false)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <div>
          <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
            Add contact
          </Button>
        </div>
      )}
    </div>
  );
}
