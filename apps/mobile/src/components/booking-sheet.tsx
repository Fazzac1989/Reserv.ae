import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, View } from 'react-native';
import { useMutation } from '@tanstack/react-query';
import { BRAND } from '@reservai/config';
import { Body, Display, Lead, Meta, Muted, Title } from './ui/text';
import { Button } from './ui/button';
import { Chip } from './ui/chip';
import { TextField } from './ui/field';
import { Rule } from './ui/screen';
import { requestBooking } from '../lib/agent';
import { useProfile, usePreferences, CONSENT_VERSION } from '../lib/profile';
import { useMotion } from '../lib/motion';

const PARTY_SIZES = [1, 2, 3, 4, 5, 6, 8];
const TIMES = ['18:00', '18:30', '19:00', '19:30', '20:00', '20:30', '21:00', '21:30'];
const OCCASIONS = ['Birthday', 'Anniversary', 'Business', 'Family', 'Celebration'];
const FLEX_MINUTES = 30;

/** Tonight, tomorrow, and the five days after. Enough without being a calendar. */
function nextDays(count: number): { iso: string; label: string }[] {
  const out: { iso: string; label: string }[] = [];
  for (let i = 0; i < count; i += 1) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    out.push({
      iso: d.toISOString().slice(0, 10),
      label:
        i === 0
          ? 'Today'
          : i === 1
            ? 'Tomorrow'
            : d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' }),
    });
  }
  return out;
}

function combine(day: string, time: string): Date {
  const [h, m] = time.split(':').map(Number);
  const d = new Date(`${day}T00:00:00`);
  d.setHours(h ?? 20, m ?? 0, 0, 0);
  return d;
}

function prettyDate(day: string): string {
  return new Date(`${day}T00:00:00`).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

/**
 * Asking for a table, in three steps.
 *
 * The order is deliberate and it is not the order the data is stored in. What
 * they want, then who they are, then what they are agreeing to — because the
 * last screen has to be a summary of decisions already made rather than the
 * first place somebody reads them.
 *
 * The primary action does not say "Book". Nothing here books anything: it
 * sends a request to a venue that has not answered yet, and a button that says
 * Book is a button that has promised a table. It says what will actually
 * happen instead.
 */
export function BookingSheet({
  venueId,
  venueName,
  vertical,
  onClose,
  onBooked,
}: {
  venueId: string;
  venueName: string;
  vertical: string;
  onClose: () => void;
  onBooked: (bookingId: string) => void;
}) {
  const animate = useMotion();
  const profile = useProfile();
  const preferences = usePreferences();

  const days = useMemo(() => nextDays(7), []);
  const [step, setStep] = useState(0);
  const [day, setDay] = useState(days[0]!.iso);
  const [time, setTime] = useState('20:00');
  const [partySize, setPartySize] = useState(2);
  const [flexible, setFlexible] = useState(true);
  const [seating, setSeating] = useState<'indoor' | 'outdoor' | 'either' | null>(null);
  const [occasion, setOccasion] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [access, setAccess] = useState('');
  const [guestName, setGuestName] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [agreed, setAgreed] = useState(false);

  /*
   * Generated once, when the sheet opens.
   *
   * Not on submit: a key made at press time is a different key per press,
   * which is precisely the case it exists to prevent. This one survives a
   * failed request, a retry and a double tap, and the server returns the
   * booking the first attempt made.
   */
  const idempotencyKey = useMemo(
    () => `${venueId}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    [venueId],
  );

  // Seeded from the profile, editable here. What the venue is told for this
  // booking is what is on this screen, not what the profile says later.
  useMemo(() => {
    if (profile.data && guestName === '') setGuestName(profile.data.full_name ?? '');
    if (profile.data && guestPhone === '') setGuestPhone(profile.data.phone_e164 ?? '');
    if (preferences.data && partySize === 2) setPartySize(preferences.data.default_party_size ?? 2);
    if (preferences.data && seating === null) {
      setSeating((preferences.data.seating_preference as typeof seating) ?? null);
    }
  }, [profile.data, preferences.data]);

  const when = combine(day, time);
  const earliest = new Date(when.getTime() - FLEX_MINUTES * 60_000);
  const latest = new Date(when.getTime() + FLEX_MINUTES * 60_000);

  const submit = useMutation({
    mutationFn: () =>
      requestBooking({
        venueId,
        scheduledFor: when.toISOString(),
        partySize,
        guestName: guestName.trim(),
        guestPhone: guestPhone.trim() || undefined,
        earliestAcceptable: flexible ? earliest.toISOString() : undefined,
        latestAcceptable: flexible ? latest.toISOString() : undefined,
        occasion: occasion ?? undefined,
        seatingPreference: seating ?? undefined,
        accessibilityRequests: access.trim() || undefined,
        specialRequests: notes.trim() || undefined,
        consentVersion: CONSENT_VERSION,
        consentShared: {
          name: true,
          phone: guestPhone.trim().length > 0,
          party_size: true,
          time: true,
          occasion: Boolean(occasion),
          special_requests: notes.trim().length > 0 || access.trim().length > 0,
        },
        idempotencyKey,
      }),
    onSuccess: (result) => onBooked(result.bookingId),
  });

  const canAdvance =
    step === 0 ? true : step === 1 ? guestName.trim().length >= 2 : agreed && !submit.isPending;

  const noun = vertical === 'restaurant' ? 'table' : 'appointment';

  return (
    <Modal
      visible
      transparent
      animationType={animate ? 'slide' : 'none'}
      onRequestClose={onClose}
      accessibilityViewIsModal
    >
      <Pressable className="flex-1 bg-ink/50" onPress={onClose} accessibilityLabel="Close" />

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View className="max-h-[92%] overflow-hidden rounded-t-[28px] bg-paper dark:bg-ink">
          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerClassName="gap-7 p-7 pb-9"
          >
            <View className="gap-2">
              <Meta>
                {venueName} · Step {step + 1} of 3
              </Meta>
              <Display>
                {step === 0 ? `The ${noun}` : step === 1 ? 'Who it is for' : 'Before I ask'}
              </Display>
            </View>

            {step === 0 ? (
              <>
                <View className="gap-3">
                  <Muted>Day</Muted>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerClassName="gap-2"
                  >
                    {days.map((d) => (
                      <Chip
                        key={d.iso}
                        label={d.label}
                        selected={day === d.iso}
                        onPress={() => setDay(d.iso)}
                      />
                    ))}
                  </ScrollView>
                </View>

                <View className="gap-3">
                  <Muted>Time</Muted>
                  <View className="flex-row flex-wrap gap-2">
                    {TIMES.map((t) => (
                      <Chip key={t} label={t} selected={time === t} onPress={() => setTime(t)} />
                    ))}
                  </View>
                </View>

                <View className="gap-3">
                  <Muted>Guests</Muted>
                  <View className="flex-row flex-wrap gap-2">
                    {PARTY_SIZES.map((n) => (
                      <Chip
                        key={n}
                        label={n === 8 ? '8+' : String(n)}
                        selected={partySize === n}
                        onPress={() => setPartySize(n)}
                      />
                    ))}
                  </View>
                </View>

                {/*
                  The window, asked as a plain question rather than as two time
                  pickers. It is the single most useful thing on this screen:
                  with it, an offer of 8:30 can be accepted without waking
                  anybody up, and without it every alternative is a question.
                */}
                <View className="gap-3">
                  <Muted>If {time} is gone</Muted>
                  <View className="flex-row flex-wrap gap-2">
                    <Chip
                      label={`Anything within half an hour`}
                      selected={flexible}
                      onPress={() => setFlexible(true)}
                    />
                    <Chip
                      label={`Only ${time}`}
                      selected={!flexible}
                      onPress={() => setFlexible(false)}
                    />
                  </View>
                </View>

                <View className="gap-3">
                  <Muted>Where you would rather sit</Muted>
                  <View className="flex-row flex-wrap gap-2">
                    {(['indoor', 'outdoor', 'either'] as const).map((s) => (
                      <Chip
                        key={s}
                        label={s === 'indoor' ? 'Inside' : s === 'outdoor' ? 'Outside' : 'Either'}
                        selected={seating === s}
                        onPress={() => setSeating(seating === s ? null : s)}
                      />
                    ))}
                  </View>
                </View>

                <View className="gap-3">
                  <Muted>Occasion</Muted>
                  <View className="flex-row flex-wrap gap-2">
                    {OCCASIONS.map((o) => (
                      <Chip
                        key={o}
                        label={o}
                        selected={occasion === o}
                        onPress={() => setOccasion(occasion === o ? null : o)}
                      />
                    ))}
                  </View>
                </View>
              </>
            ) : null}

            {step === 1 ? (
              <>
                <TextField
                  label="Name for the booking"
                  value={guestName}
                  onChangeText={setGuestName}
                  autoCapitalize="words"
                  maxLength={120}
                />
                <TextField
                  label="Mobile"
                  value={guestPhone}
                  onChangeText={setGuestPhone}
                  placeholder="+971 50 000 0000"
                  keyboardType="phone-pad"
                  maxLength={20}
                />
                <Muted>
                  The venue is given the name. The number only goes with it if you put one here, and
                  only so they can reach you about this booking.
                </Muted>

                <TextField
                  label="Anything they should know"
                  value={notes}
                  onChangeText={setNotes}
                  placeholder="A quiet table, a high chair, running ten minutes late…"
                  maxLength={500}
                />
                <TextField
                  label="Access"
                  value={access}
                  onChangeText={setAccess}
                  placeholder="Step-free, space for a wheelchair…"
                  maxLength={500}
                />

                {/*
                  Said once, here, rather than as a surprise on the summary.
                  Allergies are attached to every booking automatically because
                  forgetting to mention one is not a mistake somebody should be
                  able to make.
                */}
                {(preferences.data?.allergies ?? []).length > 0 ? (
                  <Muted>
                    Your allergies ({(preferences.data?.allergies ?? []).join(', ')}) go with every
                    booking. You do not have to type them again.
                  </Muted>
                ) : null}
              </>
            ) : null}

            {step === 2 ? (
              <>
                <View className="gap-2">
                  <Title>{venueName}</Title>
                  <Lead>{prettyDate(day)}</Lead>
                  <Lead>{time}</Lead>
                  <Lead>
                    {partySize === 1 ? 'Just you' : `${partySize} guests`}
                    {seating && seating !== 'either'
                      ? seating === 'outdoor'
                        ? ', outside'
                        : ', inside'
                      : ''}
                  </Lead>
                  {occasion ? <Lead>{occasion}</Lead> : null}
                  <Muted className="mt-1">In the name of {guestName.trim()}</Muted>
                </View>

                <View className="gap-2">
                  <Meta>What I will do</Meta>
                  <Body>
                    {flexible
                      ? `I will ask for ${time}. If it has gone, I may take anything between ${TIMES.includes(time) ? '' : ''}${new Date(earliest).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })} and ${new Date(latest).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })} without asking you again.`
                      : `I will ask for ${time} and nothing else. If it has gone I will come back to you.`}
                  </Body>
                  <Muted>
                    Anything outside that — a different time, a deposit, a minimum spend — I will
                    ask you first. Always.
                  </Muted>
                </View>

                <Rule />

                <Pressable
                  onPress={() => setAgreed((a) => !a)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: agreed }}
                  className="min-h-[44px] flex-row items-start gap-3 py-1"
                >
                  <View
                    className={
                      agreed
                        ? 'mt-1 h-5 w-5 rounded-sm bg-accent'
                        : 'mt-1 h-5 w-5 rounded-sm border border-grey-line'
                    }
                  />
                  <Body className="flex-1">
                    {BRAND.name} may contact {venueName} for me and share the details above.
                  </Body>
                </Pressable>

                {submit.isError ? (
                  <Body className="text-alert">
                    {submit.error instanceof Error
                      ? submit.error.message
                      : 'That did not go through.'}{' '}
                    Nothing has been sent — try again.
                  </Body>
                ) : null}
              </>
            ) : null}

            <View className="gap-3">
              <Button
                variant="commit"
                label={
                  step < 2
                    ? 'Continue'
                    : submit.isPending
                      ? 'Asking…'
                      : `Confirm and let ${BRAND.name} ask`
                }
                disabled={!canAdvance}
                loading={submit.isPending}
                onPress={() => (step < 2 ? setStep(step + 1) : submit.mutate())}
              />
              <Pressable
                onPress={() => (step === 0 ? onClose() : setStep(step - 1))}
                accessibilityRole="button"
                className="min-h-[44px] items-center justify-center"
              >
                <Muted>{step === 0 ? 'Not now' : 'Back'}</Muted>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
