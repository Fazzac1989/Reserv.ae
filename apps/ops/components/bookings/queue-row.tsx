'use client';

import { useState, useTransition } from 'react';
import { Clock, Phone, Users } from 'lucide-react';
import { confirmBooking, transitionBooking } from '../../lib/bookings/actions';
import type { QueueRow } from '../../lib/bookings/queries';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Input } from '../ui/input';

/** Which events an operator can apply from each state, in the order they help. */
const ACTIONS: Record<string, { event: string; label: string; variant?: 'outline' | 'ghost' }[]> = {
  draft: [{ event: 'cancel', label: 'Cancel', variant: 'ghost' }],
  user_approved: [
    { event: 'start_attempt', label: 'Start working it' },
    { event: 'cancel', label: 'Cancel', variant: 'ghost' },
  ],
  attempting: [
    { event: 'await_venue', label: 'Sent — waiting on venue', variant: 'outline' },
    { event: 'decline', label: 'Venue said no', variant: 'outline' },
    { event: 'escalate', label: 'Escalate', variant: 'outline' },
  ],
  pending_venue: [
    { event: 'decline', label: 'Venue said no', variant: 'outline' },
    { event: 'escalate', label: 'Escalate', variant: 'outline' },
  ],
  escalated: [
    { event: 'start_attempt', label: 'Try again' },
    { event: 'decline', label: 'Could not place it', variant: 'outline' },
  ],
  confirmed: [{ event: 'complete', label: 'Mark completed', variant: 'outline' }],
  reminded: [{ event: 'complete', label: 'Mark completed', variant: 'outline' }],
};

const CONFIRMABLE = ['attempting', 'pending_venue', 'escalated'];

function timeUntil(iso: string): { label: string; urgent: boolean } {
  const ms = Date.parse(iso) - Date.now();
  if (ms < 0) return { label: 'in the past', urgent: true };
  const hours = Math.round(ms / 3600_000);
  if (hours < 48) return { label: `in ${hours}h`, urgent: hours < 24 };
  return { label: `in ${Math.round(hours / 24)}d`, urgent: false };
}

function contactFrom(config: unknown): string | null {
  const c = config as { phone_e164?: string; instructions?: string } | null;
  return c?.phone_e164 ?? c?.instructions ?? null;
}

export function BookingQueueRow({ row }: { row: QueueRow }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [note, setNote] = useState('');
  const [reference, setReference] = useState('');

  const when = new Date(row.scheduled_for);
  const countdown = timeUntil(row.scheduled_for);
  const rail = row.channels.find((c) => c.is_enabled);

  function run(fn: () => Promise<{ ok: boolean; message?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) setError(result.message ?? 'That did not work.');
      else setConfirming(false);
    });
  }

  return (
    <li className="flex flex-col gap-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{row.venue?.name ?? 'Unknown venue'}</span>
            <Badge variant={row.status === 'escalated' ? 'destructive' : 'secondary'}>
              {row.status}
            </Badge>
            {countdown.urgent ? <Badge variant="destructive">{countdown.label}</Badge> : null}
          </div>

          <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />
              {when.toLocaleString('en-GB', {
                weekday: 'short',
                day: 'numeric',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit',
              })}
              {!countdown.urgent ? ` · ${countdown.label}` : ''}
            </span>
            <span className="inline-flex items-center gap-1">
              <Users className="h-3.5 w-3.5" />
              {row.party_size}
            </span>
            {rail ? (
              <span className="inline-flex items-center gap-1">
                <Phone className="h-3.5 w-3.5" />
                {rail.kind}
                {contactFrom(rail.config) ? ` · ${contactFrom(rail.config)}` : ''}
              </span>
            ) : (
              <Badge variant="outline">no channel</Badge>
            )}
          </div>

          <p className="text-sm text-muted-foreground">
            For {row.user?.full_name ?? row.user?.email ?? 'a user'}
            {row.user?.phone_e164 ? ` · ${row.user.phone_e164}` : ''}
          </p>

          {/*
            Allergies and dietary needs ride along with the booking so the
            operator does not have to go looking for them mid-call.
          */}
          {row.special_requests ? (
            <p className="mt-1 rounded-md bg-muted px-3 py-2 text-sm">{row.special_requests}</p>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {(ACTIONS[row.status] ?? []).map((action) => (
          <Button
            key={action.event}
            size="sm"
            variant={action.variant ?? 'default'}
            disabled={pending}
            onClick={() => run(() => transitionBooking(row.id, action.event))}
          >
            {action.label}
          </Button>
        ))}

        {CONFIRMABLE.includes(row.status) && !confirming ? (
          <Button size="sm" disabled={pending} onClick={() => setConfirming(true)}>
            Confirm booking
          </Button>
        ) : null}
      </div>

      {/*
        The evidence gate, in the interface. `confirmed` is the only state a
        user acts on, so a human confirmation has to record what the human
        actually did — the service and the database both refuse it otherwise.
      */}
      {confirming ? (
        <div className="flex flex-col gap-2 rounded-md border bg-muted/30 p-3">
          <label htmlFor={`note-${row.id}`} className="text-sm font-medium">
            What did the venue actually agree?
          </label>
          <Input
            id={`note-${row.id}`}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Spoke to Layla — table for 2 held under Farrell, 8pm, terrace"
          />
          <Input
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="Their reference, if they gave one (optional)"
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={pending}
              onClick={() => run(() => confirmBooking(row.id, note, reference || undefined))}
            >
              {pending ? 'Confirming…' : 'Confirm'}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </li>
  );
}
