'use client';

import { useState, useTransition } from 'react';
import { AlertTriangle, Clock, Users } from 'lucide-react';
import { approveMessage, rejectMessage } from '../../lib/whatsapp/actions';
import type { PendingMessage } from '../../lib/whatsapp/queries';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';

/**
 * One draft, waiting on a person.
 *
 * The message is editable, because what the operator approves is what goes to
 * the venue — not what the agent happened to write. Held drafts (ones that
 * failed their own checks) are marked, and the reason is shown rather than
 * hidden behind a generic warning.
 */
export function ApprovalCard({ message }: { message: PendingMessage }) {
  const [pending, startTransition] = useTransition();
  const [body, setBody] = useState(message.body);
  const [error, setError] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');

  const edited = body.trim() !== message.body.trim();
  const held = Boolean(message.error_message);

  function run(fn: () => Promise<{ ok: boolean; message?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) setError(result.message ?? 'That did not work.');
    });
  }

  return (
    <li className="flex flex-col gap-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{message.venue?.name ?? 'Unknown venue'}</span>
            {held ? (
              <Badge variant="destructive">
                <AlertTriangle className="mr-1 h-3 w-3" />
                held
              </Badge>
            ) : null}
            {edited ? <Badge variant="secondary">edited</Badge> : null}
          </div>

          {message.booking ? (
            <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" />
                {new Date(message.booking.scheduled_for).toLocaleString('en-GB', {
                  weekday: 'short',
                  day: 'numeric',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
              <span className="inline-flex items-center gap-1">
                <Users className="h-3.5 w-3.5" />
                {message.booking.party_size}
              </span>
              <Badge variant="outline">{message.booking.status}</Badge>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Not attached to a booking.</p>
          )}
        </div>
      </div>

      {/*
        Why it was held. The agent's own checks caught something — a leaked
        detail, a claim that the booking is already made — and an operator
        should see exactly what before deciding.
      */}
      {held ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          Held automatically: {message.error_message}
        </p>
      ) : null}

      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={6}
        aria-label={`Message to ${message.venue?.name ?? 'venue'}`}
        className="font-normal"
      />

      {rejecting ? (
        <div className="flex flex-col gap-2 rounded-md border bg-muted/30 p-3">
          <label htmlFor={`reason-${message.id}`} className="text-sm font-medium">
            Why are you discarding this?
          </label>
          <Input
            id={`reason-${message.id}`}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Too formal for this venue — they know us"
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="destructive"
              disabled={pending}
              onClick={() => run(() => rejectMessage(message.id, reason))}
            >
              Discard
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setRejecting(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            disabled={pending || body.trim().length === 0}
            onClick={() => run(() => approveMessage(message.id, edited ? body : undefined))}
          >
            {pending ? 'Sending…' : edited ? 'Send edited message' : 'Send as written'}
          </Button>
          <Button size="sm" variant="outline" onClick={() => setRejecting(true)}>
            Discard
          </Button>
          {edited ? (
            <Button size="sm" variant="ghost" onClick={() => setBody(message.body)}>
              Undo edits
            </Button>
          ) : null}
        </div>
      )}

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </li>
  );
}
