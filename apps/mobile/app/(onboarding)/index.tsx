import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '../../src/components/ui/screen';
import { Button } from '../../src/components/ui/button';
import { Chip } from '../../src/components/ui/chip';
import { TextField } from '../../src/components/ui/field';
import { StepProgress } from '../../src/components/ui/progress';
import { Body, Muted, Display, Meta } from '../../src/components/ui/text';
import {
  ALLERGIES,
  CUISINES,
  DIETARY,
  PARTY_SIZES,
  PRICE_BANDS,
  ZONES,
} from '../../src/data/taste';
import { useCompleteOnboarding } from '../../src/lib/profile';

type Zone = string;

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

/**
 * The taste profile, captured once.
 *
 * Held in local state and written in a single transaction at the end rather
 * than saved step by step. Onboarding is short, and a half-written profile
 * would make the Curator confident about preferences the user never finished
 * expressing.
 */
export default function Onboarding() {
  const router = useRouter();
  const complete = useCompleteOnboarding();

  const [step, setStep] = useState(0);
  const [fullName, setFullName] = useState('');
  const [homeZone, setHomeZone] = useState<Zone | null>(null);
  const [zones, setZones] = useState<Zone[]>([]);
  const [loved, setLoved] = useState<string[]>([]);
  const [avoided, setAvoided] = useState<string[]>([]);
  const [bands, setBands] = useState<number[]>([2, 3]);
  const [dietary, setDietary] = useState<string[]>([]);
  const [allergies, setAllergies] = useState<string[]>([]);
  const [partySize, setPartySize] = useState(2);

  const steps = useMemo(
    () => [
      {
        eyebrow: 'First things first',
        title: 'What should I call you?',
        blurb: 'I use this when I speak to venues on your behalf.',
        canAdvance: fullName.trim().length >= 2,
        render: () => (
          <TextField
            value={fullName}
            onChangeText={setFullName}
            placeholder="Your name"
            autoCapitalize="words"
            autoComplete="name"
            autoFocus
            returnKeyType="next"
            maxLength={120}
          />
        ),
      },
      {
        eyebrow: 'Where you are',
        title: 'Which part of town?',
        blurb: 'Pick where you usually start from. You can add the others too.',
        canAdvance: homeZone !== null,
        render: () => (
          <View className="gap-3">
            {ZONES.map((zone) => {
              const isHome = homeZone === zone.value;
              const isAlso = zones.includes(zone.value);
              return (
                <Pressable
                  key={zone.value}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: isHome }}
                  onPress={() => {
                    setHomeZone(zone.value);
                    setZones((current) =>
                      current.includes(zone.value) ? current : [...current, zone.value],
                    );
                  }}
                  onLongPress={() => setZones((current) => toggle(current, zone.value))}
                  className={
                    isHome
                      ? 'rounded-card bg-ink px-5 py-4 dark:bg-porcelain'
                      : 'rounded-card border border-stone-line px-5 py-4'
                  }
                >
                  <Body
                    className={
                      isHome
                        ? 'font-body-medium text-porcelain dark:text-ink'
                        : 'font-body-medium text-ink dark:text-porcelain'
                    }
                  >
                    {zone.label}
                  </Body>
                  <Muted className={isHome ? 'text-porcelain/70 dark:text-ink/70' : undefined}>
                    {zone.blurb}
                    {!isHome && isAlso ? ' · happy to travel here' : ''}
                  </Muted>
                </Pressable>
              );
            })}
            <Muted>
              Tap to set where you start from. Press and hold to add or remove somewhere you would
              also travel to.
            </Muted>
          </View>
        ),
      },
      {
        eyebrow: 'Your tastes',
        title: 'What do you actually like?',
        blurb: 'Pick a few. I will learn the rest from what you book.',
        canAdvance: loved.length > 0,
        render: () => (
          <View className="gap-6">
            <View className="gap-3">
              <Muted>Happy to eat</Muted>
              <View className="flex-row flex-wrap gap-2">
                {CUISINES.map((cuisine) => (
                  <Chip
                    key={cuisine}
                    label={cuisine}
                    selected={loved.includes(cuisine)}
                    onPress={() => {
                      setLoved((c) => toggle(c, cuisine));
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
                    onPress={() => setAvoided((c) => toggle(c, cuisine))}
                  />
                ))}
              </View>
            </View>
          </View>
        ),
      },
      {
        eyebrow: 'The practical bits',
        title: 'How do you usually spend?',
        blurb:
          'Pick every band that sounds like you. I will stay inside it unless you say otherwise.',
        canAdvance: bands.length > 0,
        render: () => (
          <View className="gap-6">
            <View className="gap-3">
              {PRICE_BANDS.map((band) => {
                const selected = bands.includes(band.value);
                return (
                  <Pressable
                    key={band.value}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: selected }}
                    onPress={() => setBands((c) => toggle(c, band.value))}
                    className={
                      selected
                        ? 'rounded-card bg-ink px-5 py-4 dark:bg-porcelain'
                        : 'rounded-card border border-stone-line px-5 py-4'
                    }
                  >
                    <Body
                      className={
                        selected
                          ? 'font-body-medium text-porcelain dark:text-ink'
                          : 'font-body-medium text-ink dark:text-porcelain'
                      }
                    >
                      {band.label}
                    </Body>
                    <Muted className={selected ? 'text-porcelain/70 dark:text-ink/70' : undefined}>
                      {band.blurb}
                    </Muted>
                  </Pressable>
                );
              })}
            </View>

            <View className="gap-3">
              <Muted>Usually a table for</Muted>
              <View className="flex-row flex-wrap gap-2">
                {PARTY_SIZES.map((size) => (
                  <Chip
                    key={size}
                    label={size === 8 ? '8+' : String(size)}
                    selected={partySize === size}
                    onPress={() => setPartySize(size)}
                  />
                ))}
              </View>
            </View>
          </View>
        ),
      },
      {
        eyebrow: 'Anything I must know',
        title: 'Dietary needs?',
        blurb: 'I pass these to the venue every single time, without you asking.',
        canAdvance: true,
        render: () => (
          <View className="gap-6">
            <View className="gap-3">
              <Muted>Preferences</Muted>
              <View className="flex-row flex-wrap gap-2">
                {DIETARY.map((item) => (
                  <Chip
                    key={item}
                    label={item}
                    selected={dietary.includes(item)}
                    onPress={() => setDietary((c) => toggle(c, item))}
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
                    onPress={() => setAllergies((c) => toggle(c, item))}
                  />
                ))}
              </View>
            </View>

            <Muted>If yours is not here, tell me in chat and I will remember it.</Muted>
          </View>
        ),
      },
    ],
    [fullName, homeZone, zones, loved, avoided, bands, dietary, allergies, partySize],
  );

  const current = steps[step]!;
  const isLast = step === steps.length - 1;

  async function onNext() {
    if (!isLast) {
      setStep((s) => s + 1);
      return;
    }

    await complete.mutateAsync({
      fullName,
      preferences: {
        // The schema stores a range, not a set, so picking 1 and 4 widens to
        // 1–4 rather than excluding the middle. The profile screen reads the
        // range back the same way, so what the user sees always matches what
        // the Curator will actually filter on.
        cuisines_loved: loved,
        cuisines_avoided: avoided,
        price_band_min: Math.min(...bands),
        price_band_max: Math.max(...bands),
        dietary,
        allergies,
        home_zone: homeZone,
        preferred_zones: zones,
        default_party_size: partySize,
      },
    });

    router.replace('/(app)');
  }

  return (
    <Screen>
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View className="gap-6 px-7 pt-4">
          <StepProgress total={steps.length} current={step} />
        </View>

        <ScrollView
          contentContainerClassName="px-7 pb-8 pt-8 gap-7"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View className="gap-3">
            <Meta>{current.eyebrow}</Meta>
            <Display>{current.title}</Display>
            <Body>{current.blurb}</Body>
          </View>

          {current.render()}
        </ScrollView>

        <View className="gap-3 border-t border-stone-line px-7 pb-4 pt-4 border-stone-line">
          {complete.isError ? (
            <Muted className="text-clay">
              {complete.error instanceof Error
                ? complete.error.message
                : 'Could not save that. Try again.'}
            </Muted>
          ) : null}

          <Button
            label={isLast ? 'Finish' : 'Continue'}
            onPress={onNext}
            disabled={!current.canAdvance}
            loading={complete.isPending}
          />

          {step > 0 ? (
            <Button label="Back" variant="quiet" onPress={() => setStep((s) => s - 1)} />
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}
