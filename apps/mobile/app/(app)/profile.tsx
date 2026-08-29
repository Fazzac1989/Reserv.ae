import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ScreenScroll } from '../../src/components/ui/screen';
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
} from '../../src/data/taste';
import {
  usePreferences,
  useProfile,
  useSavePreferences,
  useSaveProfile,
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
export default function ProfileScreen() {
  const router = useRouter();
  const profile = useProfile();
  const preferences = usePreferences();
  const savePreferences = useSavePreferences();
  const saveProfile = useSaveProfile();

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
  }, [preferences.data, dirty]);

  useEffect(() => {
    if (!profile.data || dirty) return;
    setFullName(profile.data.full_name ?? '');
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
    });
    await saveProfile.mutateAsync({
      full_name: fullName.trim() || null,
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
          <Muted className="text-clay">Pick at least one spend band.</Muted>
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

      <NotificationPrefsControl
        prefs={notifications}
        busy={pending}
        onChange={(next) => {
          setDirty(true);
          setSaved(false);
          setNotifications(next);
        }}
      />

      {error ? (
        <Muted className="text-clay">
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
    </ScreenScroll>
  );
}
