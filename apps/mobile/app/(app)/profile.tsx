import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Rule, ScreenScroll } from '../../src/components/ui/screen';
import { Button } from '../../src/components/ui/button';
import { Chip } from '../../src/components/ui/chip';
import { TextField } from '../../src/components/ui/field';
import { Body, Muted, Display, Meta } from '../../src/components/ui/text';
import {
  ALLERGIES,
  CUISINES,
  DIETARY,
  PARTY_SIZES,
  PRICE_BANDS,
  ZONES,
  SEATING,
  SMOKING,
  ALCOHOL,
  ACCESSIBILITY,
  FAMILY_NEEDS,
  OCCASIONS,
} from '../../src/data/taste';
import {
  usePreferences,
  useProfile,
  useSavePreferences,
  useSaveProfile,
  useConsents,
  useSetConsent,
  useDeleteAccount,
  type ConsentKind,
} from '../../src/lib/profile';
import { signOut } from '../../src/lib/auth';
import {
  NotificationPrefsControl,
  type NotificationPrefs,
} from '../../src/components/notification-prefs';

type Zone = string;

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

function bandsBetween(min: number, max: number): number[] {
  return PRICE_BANDS.map((b) => b.value).filter((v) => v >= min && v <= max);
}

/**
 * Everything captured in onboarding, editable afterwards.
 *
 * Saved explicitly rather than on every tap: a taste profile that rewrites
 * itself while you are still deciding is unnerving, and each change would be a
 * round trip.
 */
/**
 * What each permission actually means, in the words the person sees.
 *
 * The version stored against a decision refers to this wording. Change it
 * materially and CONSENT_VERSION has to move with it, or an old yes becomes a
 * yes to something nobody agreed to.
 */
const CONSENT_COPY: {
  kind: ConsentKind;
  title: string;
  blurb: string;
  defaultGranted: boolean;
}[] = [
  {
    kind: 'data_sharing',
    title: 'Give venues your details when booking',
    blurb:
      'Your name, and a mobile number if the venue asks for one. Reserv cannot hold a table without telling them who it is for.',
    defaultGranted: false,
  },
  {
    kind: 'whatsapp',
    title: 'Message me on WhatsApp',
    blurb: 'Confirmations and reminders there as well as in the app. Off by default.',
    defaultGranted: false,
  },
  {
    kind: 'marketing',
    title: 'Tell me about new places',
    blurb: 'Occasional notes about openings and offers. Never about a booking you already have.',
    defaultGranted: false,
  },
];

export default function ProfileScreen() {
  const router = useRouter();
  const profile = useProfile();
  const preferences = usePreferences();
  const savePreferences = useSavePreferences();
  const saveProfile = useSaveProfile();
  const consents = useConsents();
  const setConsent = useSetConsent();
  const deleteAccount = useDeleteAccount();

  const [fullName, setFullName] = useState('');
  const [homeZone, setHomeZone] = useState<Zone | null>(null);
  const [zones, setZones] = useState<Zone[]>([]);
  const [loved, setLoved] = useState<string[]>([]);
  const [avoided, setAvoided] = useState<string[]>([]);
  const [bands, setBands] = useState<number[]>([]);
  const [dietary, setDietary] = useState<string[]>([]);
  const [allergies, setAllergies] = useState<string[]>([]);
  const [partySize, setPartySize] = useState(2);
  const [notifications, setNotifications] = useState<NotificationPrefs>({
    push_enabled: true,
    whatsapp_enabled: true,
    reminder_24h: true,
    reminder_2h: true,
    proactive_suggestions: false,
  });
  const [phone, setPhone] = useState('');
  const [seating, setSeating] = useState<string | null>(null);
  const [smoking, setSmoking] = useState<string | null>(null);
  const [alcohol, setAlcohol] = useState<string | null>(null);
  const [access, setAccess] = useState<string[]>([]);
  const [familyNeeds, setFamilyNeeds] = useState<string[]>([]);
  const [occasions, setOccasions] = useState<string[]>([]);
  const [quietHours, setQuietHours] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);

  // Seed the form once the stored profile arrives. Later refetches must not
  // stamp over edits in progress.
  useEffect(() => {
    if (!preferences.data || dirty) return;
    const p = preferences.data;
    setHomeZone(p.home_zone);
    setZones(p.preferred_zones ?? []);
    setLoved(p.cuisines_loved ?? []);
    setAvoided(p.cuisines_avoided ?? []);
    setBands(bandsBetween(p.price_band_min, p.price_band_max));
    setDietary(p.dietary ?? []);
    setAllergies(p.allergies ?? []);
    setPartySize(p.default_party_size);
    setSeating(p.seating_preference);
    setSmoking(p.smoking_preference);
    setAlcohol(p.alcohol_preference);
    setAccess(p.accessibility_needs ?? []);
    setFamilyNeeds(p.family_needs ?? []);
    setOccasions(p.occasions ?? []);
    setQuietHours(p.quiet_hours_start !== null);
  }, [preferences.data, dirty]);

  useEffect(() => {
    if (!profile.data || dirty) return;
    setFullName(profile.data.full_name ?? '');
    setPhone(profile.data.phone_e164 ?? '');
    if (profile.data.notification_prefs) {
      // A jsonb column arrives as Json; the shape is enforced on write by
      // notificationPrefsSchema in packages/core.
      setNotifications(profile.data.notification_prefs as unknown as NotificationPrefs);
    }
  }, [profile.data, dirty]);

  function edit<T>(setter: (value: T) => void) {
    return (value: T) => {
      setDirty(true);
      setSaved(false);
      setter(value);
    };
  }

  async function onSave() {
    if (bands.length === 0) return;
    await savePreferences.mutateAsync({
      cuisines_loved: loved,
      cuisines_avoided: avoided,
      price_band_min: Math.min(...bands),
      price_band_max: Math.max(...bands),
      dietary,
      allergies,
      home_zone: homeZone,
      preferred_zones: zones,
      default_party_size: partySize,
      seating_preference: seating,
      smoking_preference: smoking,
      alcohol_preference: alcohol,
      accessibility_needs: access,
      family_needs: familyNeeds,
      occasions,
      // Both ends or neither, which the table also insists on. A window with
      // one end open is not a window.
      quiet_hours_start: quietHours ? '22:00' : null,
      quiet_hours_end: quietHours ? '08:00' : null,
    });
    await saveProfile.mutateAsync({
      full_name: fullName.trim() || null,
      phone_e164: phone.trim() || null,
      notification_prefs: JSON.parse(JSON.stringify(notifications)),
    });
    setDirty(false);
    setSaved(true);
  }

  if (preferences.isLoading || profile.isLoading) {
    return (
      <ScreenScroll>
        <View className="items-center py-20">
          <ActivityIndicator />
        </View>
      </ScreenScroll>
    );
  }

  const pending = savePreferences.isPending || saveProfile.isPending;
  const error = savePreferences.error ?? saveProfile.error ?? preferences.error;

  return (
    <ScreenScroll>
      <View className="gap-3 pt-6">
        <Meta>Your profile</Meta>
        <Display>What I know about you</Display>
        <Body>I use this every time I suggest somewhere or speak to a venue.</Body>
      </View>

      <TextField
        label="Name"
        value={fullName}
        onChangeText={edit(setFullName)}
        autoCapitalize="words"
        maxLength={120}
      />

      <TextField
        label="Mobile"
        value={phone}
        onChangeText={edit(setPhone)}
        placeholder="+971 50 000 0000"
        keyboardType="phone-pad"
        autoComplete="tel"
        maxLength={20}
      />

      <View className="gap-3">
        <Muted>Where you start from</Muted>
        <View className="flex-row flex-wrap gap-2">
          {ZONES.map((zone) => (
            <Chip
              key={zone.value}
              label={zone.label}
              selected={homeZone === zone.value}
              onPress={() => edit(setHomeZone)(zone.value)}
            />
          ))}
        </View>
      </View>

      <View className="gap-3">
        <Muted>Also happy to travel to</Muted>
        <View className="flex-row flex-wrap gap-2">
          {ZONES.map((zone) => (
            <Chip
              key={zone.value}
              label={zone.label}
              selected={zones.includes(zone.value)}
              onPress={() => edit(setZones)(toggle(zones, zone.value))}
            />
          ))}
        </View>
      </View>

      <View className="gap-3">
        <Muted>Happy to eat</Muted>
        <View className="flex-row flex-wrap gap-2">
          {CUISINES.map((cuisine) => (
            <Chip
              key={cuisine}
              label={cuisine}
              selected={loved.includes(cuisine)}
              onPress={() => {
                edit(setLoved)(toggle(loved, cuisine));
                setAvoided((c) => c.filter((v) => v !== cuisine));
              }}
            />
          ))}
        </View>
      </View>

      <View className="gap-3">
        <Muted>Rather not</Muted>
        <View className="flex-row flex-wrap gap-2">
          {CUISINES.filter((c) => !loved.includes(c)).map((cuisine) => (
            <Chip
              key={cuisine}
              label={cuisine}
              tone="negative"
              selected={avoided.includes(cuisine)}
              onPress={() => edit(setAvoided)(toggle(avoided, cuisine))}
            />
          ))}
        </View>
      </View>

      <View className="gap-3">
        <Muted>Usual spend</Muted>
        <View className="flex-row flex-wrap gap-2">
          {PRICE_BANDS.map((band) => (
            <Chip
              key={band.value}
              label={band.label}
              selected={bands.includes(band.value)}
              onPress={() => edit(setBands)(toggle(bands, band.value))}
            />
          ))}
        </View>
        {bands.length === 0 ? (
          <Muted className="text-alert">Pick at least one spend band.</Muted>
        ) : null}
      </View>

      <View className="gap-3">
        <Muted>Usually a table for</Muted>
        <View className="flex-row flex-wrap gap-2">
          {PARTY_SIZES.map((size) => (
            <Chip
              key={size}
              label={size === 8 ? '8+' : String(size)}
              selected={partySize === size}
              onPress={() => edit(setPartySize)(size)}
            />
          ))}
        </View>
      </View>

      <View className="gap-3">
        <Muted>Dietary</Muted>
        <View className="flex-row flex-wrap gap-2">
          {DIETARY.map((item) => (
            <Chip
              key={item}
              label={item}
              selected={dietary.includes(item)}
              onPress={() => edit(setDietary)(toggle(dietary, item))}
            />
          ))}
        </View>
      </View>

      <View className="gap-3">
        <Muted>Allergies</Muted>
        <View className="flex-row flex-wrap gap-2">
          {ALLERGIES.map((item) => (
            <Chip
              key={item}
              label={item}
              selected={allergies.includes(item)}
              onPress={() => edit(setAllergies)(toggle(allergies, item))}
            />
          ))}
        </View>
      </View>

      {/*
        How they like to sit, and what would spoil it.

        Three single-choice questions rather than toggles, because "either" is
        a real and common answer that a switch cannot express — and a venue
        asked for a non-smoking table by somebody who did not mind is a request
        we made up.
      */}
      <View className="gap-3">
        <Muted>Where you like to sit</Muted>
        <View className="flex-row flex-wrap gap-2">
          {SEATING.map((option) => (
            <Chip
              key={option.value}
              label={option.label}
              selected={seating === option.value}
              onPress={() => edit(setSeating)(seating === option.value ? null : option.value)}
            />
          ))}
        </View>
      </View>

      <View className="gap-3">
        <Muted>Smoking</Muted>
        <View className="flex-row flex-wrap gap-2">
          {SMOKING.map((option) => (
            <Chip
              key={option.value}
              label={option.label}
              selected={smoking === option.value}
              onPress={() => edit(setSmoking)(smoking === option.value ? null : option.value)}
            />
          ))}
        </View>
      </View>

      <View className="gap-3">
        <Muted>Alcohol</Muted>
        <View className="flex-row flex-wrap gap-2">
          {ALCOHOL.map((option) => (
            <Chip
              key={option.value}
              label={option.label}
              selected={alcohol === option.value}
              onPress={() => edit(setAlcohol)(alcohol === option.value ? null : option.value)}
            />
          ))}
        </View>
      </View>

      <View className="gap-3">
        <Muted>Access</Muted>
        <View className="flex-row flex-wrap gap-2">
          {ACCESSIBILITY.map((item) => (
            <Chip
              key={item}
              label={item}
              selected={access.includes(item)}
              onPress={() => edit(setAccess)(toggle(access, item))}
            />
          ))}
        </View>
      </View>

      <View className="gap-3">
        <Muted>With children</Muted>
        <View className="flex-row flex-wrap gap-2">
          {FAMILY_NEEDS.map((item) => (
            <Chip
              key={item}
              label={item}
              selected={familyNeeds.includes(item)}
              onPress={() => edit(setFamilyNeeds)(toggle(familyNeeds, item))}
            />
          ))}
        </View>
      </View>

      <View className="gap-3">
        <Muted>Occasions you book for</Muted>
        <View className="flex-row flex-wrap gap-2">
          {OCCASIONS.map((item) => (
            <Chip
              key={item}
              label={item}
              selected={occasions.includes(item)}
              onPress={() => edit(setOccasions)(toggle(occasions, item))}
            />
          ))}
        </View>
      </View>

      <NotificationPrefsControl
        prefs={notifications}
        busy={pending}
        onChange={(next) => {
          setDirty(true);
          setSaved(false);
          setNotifications(next);
        }}
      />

      <View className="gap-3">
        <Muted>Quiet hours</Muted>
        <View className="flex-row flex-wrap gap-2">
          <Chip
            label="Nothing between 22:00 and 08:00"
            selected={quietHours}
            onPress={() => edit(setQuietHours)(!quietHours)}
          />
        </View>
        <Muted>
          A reminder for a table tonight still arrives. This holds back everything that could have
          waited until morning.
        </Muted>
      </View>

      {error ? (
        <Muted className="text-alert">
          {error instanceof Error ? error.message : 'Could not save that.'}
        </Muted>
      ) : null}
      {saved ? <Muted>Saved.</Muted> : null}

      <View className="gap-3">
        <Button
          label="Save changes"
          onPress={onSave}
          disabled={!dirty || bands.length === 0}
          loading={pending}
        />
        <Button label="Back" variant="primary" onPress={() => router.back()} />
        <Pressable
          accessibilityRole="button"
          onPress={() => void signOut()}
          className="items-center py-3"
        >
          <Muted>Sign out</Muted>
        </Pressable>
      </View>

      <Rule />

      {/*
        Permission, asked in words rather than as switches labelled with nouns.

        Each of these is stored as a decision — which wording, agreed when —
        rather than as a boolean, because "true" cannot answer the question
        somebody asks a year later. Withdrawing is recorded the same way as
        agreeing: a refusal is a decision, and deleting the row would lose the
        fact that we ever asked.

        Sharing your details with a venue is the one Reserv cannot work
        without, and it says so rather than being switched on quietly.
      */}
      <View className="gap-5">
        <Meta>Permission</Meta>

        {CONSENT_COPY.map((item) => {
          const granted = consents.data?.[item.kind] ?? item.defaultGranted;
          return (
            <View key={item.kind} className="gap-2">
              <Body className="font-body-medium">{item.title}</Body>
              <Muted>{item.blurb}</Muted>
              <View className="flex-row gap-2">
                <Chip
                  label={granted ? 'Allowed' : 'Allow'}
                  selected={granted}
                  onPress={() => setConsent.mutate({ kind: item.kind, granted: true })}
                />
                <Chip
                  label={granted ? 'Stop' : 'Not allowed'}
                  selected={!granted}
                  onPress={() => setConsent.mutate({ kind: item.kind, granted: false })}
                />
              </View>
            </View>
          );
        })}
      </View>

      <Rule />

      {/*
        Deleting everything, and saying plainly what that means before it
        happens rather than after. Two taps, and the second one names the
        consequence — a single button labelled "Delete" is how somebody
        removes their account by accident.
      */}
      <View className="gap-3">
        <Meta>Your data</Meta>
        {confirmDelete ? (
          <>
            <Body>
              This deletes your account, your preferences, everything you have kept and every
              booking Reserv has made for you. It cannot be undone and there is no copy.
            </Body>
            <Button
              label={deleteAccount.isPending ? 'Deleting…' : 'Yes, delete everything'}
              variant="commit"
              disabled={deleteAccount.isPending}
              onPress={() => deleteAccount.mutate()}
            />
            <Pressable
              onPress={() => setConfirmDelete(false)}
              accessibilityRole="button"
              className="min-h-[44px] justify-center"
            >
              <Muted>Keep my account</Muted>
            </Pressable>
          </>
        ) : (
          <Pressable
            onPress={() => setConfirmDelete(true)}
            accessibilityRole="button"
            className="min-h-[44px] justify-center"
          >
            <Muted className="text-alert">Delete my account and everything in it</Muted>
          </Pressable>
        )}
        {deleteAccount.isError ? (
          <Muted className="text-alert">
            That did not work. Nothing has been deleted — try again in a moment.
          </Muted>
        ) : null}
      </View>
    </ScreenScroll>
  );
}
