'use client';

import { useActionState, useState, useTransition } from 'react';
import { useFormStatus } from 'react-dom';
import { Trash2 } from 'lucide-react';
import {
  inviteVenueMember,
  removeVenueMember,
  revokeVenueInvite,
} from '../../lib/partners/actions';
import type { VenueInviteRow, VenueMemberRow } from '../../lib/partners/queries';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Field } from './field';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? 'Inviting…' : 'Send invitation'}
    </Button>
  );
}

function when(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/**
 * Who from the venue can get into the back office.
 *
 * The wording matters here more than usual, because this is the one screen
 * where an operator could believe they are creating an account. They are not:
 * an invitation names an address, and the person becomes a member the first
 * time they sign in with a code sent to it. Nothing on this page sets a
 * password, and there is nothing to read back to them over the phone.
 */
export function AccessList({
  venueId,
  members,
  invites,
}: {
  venueId: string;
  members: VenueMemberRow[];
  invites: VenueInviteRow[];
}) {
  const [state, formAction] = useActionState(inviteVenueMember.bind(null, venueId), null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function revoke(inviteId: string) {
    setError(null);
    startTransition(async () => {
      const result = await revokeVenueInvite(venueId, inviteId);
      if (!result.ok) setError(result.message);
    });
  }

  function remove(userId: string) {
    setError(null);
    startTransition(async () => {
      const result = await removeVenueMember(venueId, userId);
      if (!result.ok) setError(result.message);
    });
  }

  return (
    <div className="flex flex-col gap-5">
      {members.length === 0 && invites.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nobody from this venue has access. It is listed, not claimed — bookings still work,
          and they simply do not see them.
        </p>
      ) : null}

      {members.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {members.map((member) => (
            <li
              key={member.userId}
              className="flex items-start gap-3 rounded-lg border px-3 py-2.5"
            >
              <div className="min-w-0 flex-1">
                <p className="font-medium">
                  {member.fullName ?? member.email}
                  <span className="ml-2 font-normal text-muted-foreground">{member.role}</span>
                </p>
                <p className="text-sm text-muted-foreground">
                  {member.fullName ? `${member.email} · ` : ''}since {when(member.since)}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={pending}
                onClick={() => remove(member.userId)}
                aria-label={`Remove ${member.email}`}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}

      {invites.length > 0 ? (
        <div className="flex flex-col gap-2">
          <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
            Invited, not yet signed in
          </p>
          <ul className="flex flex-col gap-2">
            {invites.map((pendingInvite) => (
              <li
                key={pendingInvite.id}
                className="flex items-start gap-3 rounded-lg border border-dashed px-3 py-2.5"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {pendingInvite.email}
                    <span className="ml-2 font-normal text-muted-foreground">
                      {pendingInvite.role}
                    </span>
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {pendingInvite.expired
                      ? `Expired ${when(pendingInvite.expiresAt)} — invite again`
                      : `Expires ${when(pendingInvite.expiresAt)}`}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={pending}
                  onClick={() => revoke(pendingInvite.id)}
                  aria-label={`Withdraw the invitation to ${pendingInvite.email}`}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <form action={formAction} className="flex flex-col gap-3 border-t pt-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_10rem]">
          <Field>
            <Label htmlFor="access-email">Email</Label>
            <Input
              id="access-email"
              name="email"
              type="email"
              required
              placeholder="manager@venue.example"
            />
          </Field>
          <Field>
            <Label htmlFor="access-role">Role</Label>
            <select
              id="access-role"
              name="role"
              defaultValue="manager"
              className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-sm"
            >
              <option value="owner">owner</option>
              <option value="manager">manager</option>
              <option value="staff">staff</option>
            </select>
          </Field>
        </div>

        <p className="text-sm text-muted-foreground">
          They sign in at the partner console with a six-digit code sent to this address. No
          password is set here and none can be read back to them.
        </p>

        {state && !state.ok ? <p className="text-sm text-destructive">{state.message}</p> : null}

        <div>
          <SubmitButton />
        </div>
      </form>
    </div>
  );
}
