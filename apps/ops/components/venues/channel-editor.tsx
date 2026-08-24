'use client';

import { useActionState, useState, useTransition } from 'react';
import { useFormStatus } from 'react-dom';
import { ArrowDown, ArrowUp, Trash2 } from 'lucide-react';
import {
  deleteChannel,
  moveChannel,
  setChannelEnabled,
  upsertChannel,
  type ActionResult,
} from '../../lib/venues/actions';
import {
  BOOKING_PLATFORMS,
  DEFAULT_PRIORITY,
  DEFAULT_SLA_MINUTES,
  RAIL_KINDS,
  type RailKind,
} from '../../lib/venues/constants';
import type { VenueChannel } from '../../lib/venues/queries';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Badge } from '../ui/badge';
import { Field } from './field';
import { formDefaults } from './use-form-defaults';

/** Only the fields the console shows; the rest of the config is rail-specific. */
type ChannelConfig = Record<string, unknown>;

function describe(channel: VenueChannel): string {
  const config = (channel.config ?? {}) as ChannelConfig;
  switch (channel.kind) {
    case 'api':
      return `${String(config.platform ?? 'unknown')} · ${String(config.external_venue_id ?? '')}`;
    case 'whatsapp':
      return `${String(config.phone_e164 ?? '')}${config.contact_name ? ` · ${String(config.contact_name)}` : ''}`;
    case 'voice':
      return `${String(config.phone_e164 ?? '')} · ${String(config.preferred_language ?? 'en')}`;
    default:
      return String(config.instructions ?? '');
  }
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? 'Saving…' : 'Save channel'}
    </Button>
  );
}

/**
 * Booking channels for one venue, in priority order.
 *
 * The order is the fallback chain the rail selector walks, so it is edited by
 * nudging rows up and down rather than by typing numbers — the meaning that
 * matters is "before" and "after", not the value itself.
 */
export function ChannelEditor({
  venueId,
  channels,
}: {
  venueId: string;
  channels: VenueChannel[];
}) {
  const [state, formAction] = useActionState(upsertChannel.bind(null, venueId), null);
  const [pending, startTransition] = useTransition();
  const [rowError, setRowError] = useState<string | null>(null);
  const [editing, setEditing] = useState<RailKind | null>(null);

  const existing = new Set(channels.map((c) => c.kind));
  const editingChannel = editing ? channels.find((c) => c.kind === editing) : undefined;
  const config = (editingChannel?.config ?? {}) as ChannelConfig;
  const d = formDefaults(state);

  function run(fn: () => Promise<ActionResult>) {
    setRowError(null);
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) setRowError(result.message);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {channels.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No channels yet. Without one, this venue can only be booked by ops picking up the phone.
        </p>
      ) : (
        <ol className="flex flex-col gap-2">
          {channels.map((channel, index) => (
            <li
              key={channel.id}
              className="flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2.5"
            >
              <div className="flex flex-col gap-0.5">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5"
                  aria-label={`Move ${channel.kind} earlier`}
                  disabled={index === 0 || pending}
                  onClick={() => run(() => moveChannel(venueId, channel.id, 'up'))}
                >
                  <ArrowUp className="h-3 w-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5"
                  aria-label={`Move ${channel.kind} later`}
                  disabled={index === channels.length - 1 || pending}
                  onClick={() => run(() => moveChannel(venueId, channel.id, 'down'))}
                >
                  <ArrowDown className="h-3 w-3" />
                </Button>
              </div>

              <div className="min-w-40 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{channel.kind}</span>
                  <Badge variant={channel.is_enabled ? 'secondary' : 'outline'}>
                    {channel.is_enabled ? 'enabled' : 'disabled'}
                  </Badge>
                </div>
                <p className="truncate text-sm text-muted-foreground">{describe(channel)}</p>
              </div>

              <span className="text-sm tabular-nums text-muted-foreground">
                priority {channel.priority} · SLA {channel.sla_minutes}m
              </span>

              <div className="flex items-center gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() =>
                    run(() => setChannelEnabled(venueId, channel.id, !channel.is_enabled))
                  }
                >
                  {channel.is_enabled ? 'Disable' : 'Enable'}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEditing(channel.kind)}>
                  Edit
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={`Delete ${channel.kind} channel`}
                  disabled={pending}
                  onClick={() => run(() => deleteChannel(venueId, channel.id))}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </li>
          ))}
        </ol>
      )}

      {rowError ? (
        <p role="alert" className="text-sm text-destructive">
          {rowError}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {RAIL_KINDS.map((kind) => (
          <Button
            key={kind}
            size="sm"
            variant={editing === kind ? 'default' : 'outline'}
            onClick={() => setEditing(editing === kind ? null : kind)}
          >
            {existing.has(kind) ? `Edit ${kind}` : `Add ${kind}`}
          </Button>
        ))}
      </div>

      {editing ? (
        <form
          action={formAction}
          key={editing}
          className="flex flex-col gap-4 rounded-lg border bg-muted/30 p-4"
        >
          <input type="hidden" name="kind" value={editing} />

          <div className="grid gap-4 sm:grid-cols-2">
            {editing === 'api' ? (
              <>
                <Field>
                  <Label htmlFor="platform">Platform</Label>
                  <select
                    id="platform"
                    name="platform"
                    defaultValue={d.text('platform', String(config.platform ?? 'sevenrooms'))}
                    className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
                  >
                    {BOOKING_PLATFORMS.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field>
                  <Label htmlFor="external_venue_id">Their venue id</Label>
                  <Input
                    id="external_venue_id"
                    name="external_venue_id"
                    defaultValue={d.text(
                      'external_venue_id',
                      String(config.external_venue_id ?? ''),
                    )}
                    required
                  />
                </Field>
                <Field className="sm:col-span-2">
                  <Label htmlFor="credentials_ref">
                    Credentials reference
                    <span className="ml-2 font-normal text-muted-foreground">
                      a pointer to the secret store — never the secret itself
                    </span>
                  </Label>
                  <Input
                    id="credentials_ref"
                    name="credentials_ref"
                    defaultValue={d.text('credentials_ref', String(config.credentials_ref ?? ''))}
                    placeholder="secret://sevenrooms/venue-name"
                    required
                  />
                </Field>
                <label className="flex items-center gap-2 text-sm sm:col-span-2">
                  <input
                    type="checkbox"
                    name="supports_availability_lookup"
                    defaultChecked={d.checked(
                      'supports_availability_lookup',
                      Boolean(config.supports_availability_lookup),
                    )}
                  />
                  Availability lookup is supported (the Curator can offer real slots)
                </label>
              </>
            ) : null}

            {editing === 'whatsapp' ? (
              <>
                <Field>
                  <Label htmlFor="phone_e164">WhatsApp number</Label>
                  <Input
                    id="phone_e164"
                    name="phone_e164"
                    defaultValue={d.text('phone_e164', String(config.phone_e164 ?? ''))}
                    placeholder="+9715XXXXXXX"
                    required
                  />
                </Field>
                <Field>
                  <Label htmlFor="contact_name">Contact name</Label>
                  <Input
                    id="contact_name"
                    name="contact_name"
                    defaultValue={d.text('contact_name', String(config.contact_name ?? ''))}
                  />
                </Field>
                <label className="flex items-center gap-2 text-sm sm:col-span-2">
                  <input
                    type="checkbox"
                    name="human_approval_required"
                    defaultChecked={d.checked(
                      'human_approval_required',
                      config.human_approval_required !== false,
                    )}
                  />
                  A human approves every outbound message (default, and how the pilot starts)
                </label>
              </>
            ) : null}

            {editing === 'voice' ? (
              <>
                <Field>
                  <Label htmlFor="phone_e164">Phone number</Label>
                  <Input
                    id="phone_e164"
                    name="phone_e164"
                    defaultValue={d.text('phone_e164', String(config.phone_e164 ?? ''))}
                    placeholder="+9714XXXXXXX"
                    required
                  />
                </Field>
                <Field>
                  <Label htmlFor="preferred_language">Preferred language</Label>
                  <select
                    id="preferred_language"
                    name="preferred_language"
                    defaultValue={d.text(
                      'preferred_language',
                      String(config.preferred_language ?? 'en'),
                    )}
                    className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
                  >
                    <option value="en">English</option>
                    <option value="ar">Arabic</option>
                  </select>
                </Field>
                <label className="flex items-start gap-2 text-sm sm:col-span-2">
                  <input
                    type="checkbox"
                    name="recording_consent_obtained"
                    defaultChecked={d.checked(
                      'recording_consent_obtained',
                      Boolean(config.recording_consent_obtained),
                    )}
                    className="mt-1"
                  />
                  <span>
                    The venue agreed to calls being recorded.
                    <span className="block text-muted-foreground">
                      UAE recording-consent rules are still an open question for the pilot. This
                      channel cannot be enabled until this is ticked.
                    </span>
                  </span>
                </label>
              </>
            ) : null}

            {editing === 'manual' ? (
              <Field className="sm:col-span-2">
                <Label htmlFor="instructions">Instructions for ops</Label>
                <Input
                  id="instructions"
                  name="instructions"
                  defaultValue={d.text('instructions', String(config.instructions ?? ''))}
                  placeholder="Call the front desk and ask for the reservations manager."
                  required
                />
              </Field>
            ) : null}

            <Field>
              <Label htmlFor="priority">
                Priority
                <span className="ml-2 font-normal text-muted-foreground">lower runs first</span>
              </Label>
              <Input
                id="priority"
                name="priority"
                type="number"
                min={0}
                max={100}
                defaultValue={d.text(
                  'priority',
                  editingChannel?.priority ?? DEFAULT_PRIORITY[editing],
                )}
              />
            </Field>

            <Field>
              <Label htmlFor="sla_minutes">
                SLA
                <span className="ml-2 font-normal text-muted-foreground">
                  minutes before escalating to ops
                </span>
              </Label>
              <Input
                id="sla_minutes"
                name="sla_minutes"
                type="number"
                min={1}
                max={1440}
                defaultValue={d.text(
                  'sla_minutes',
                  editingChannel?.sla_minutes ?? DEFAULT_SLA_MINUTES[editing],
                )}
              />
            </Field>

            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input
                type="checkbox"
                name="is_enabled"
                defaultChecked={d.checked('is_enabled', editingChannel?.is_enabled ?? false)}
              />
              Enabled
            </label>
          </div>

          {state && !state.ok ? (
            <p role="alert" className="text-sm text-destructive">
              {state.message}
            </p>
          ) : null}
          {state?.ok ? <p className="text-sm text-muted-foreground">Saved.</p> : null}

          <div className="flex gap-2">
            <SubmitButton />
            <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(null)}>
              Close
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
