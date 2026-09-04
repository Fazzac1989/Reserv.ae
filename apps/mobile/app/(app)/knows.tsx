import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { confidenceWord } from '@reservai/core';
import { Rule, ScreenScroll } from '../../src/components/ui/screen';
import { Button } from '../../src/components/ui/button';
import { TextField } from '../../src/components/ui/field';
import { Body, Display, Lead, Meta, Muted, Title } from '../../src/components/ui/text';
import { LiveStatus } from '../../src/components/booking-state';
import {
  describeInference,
  useForgetPerson,
  useInferences,
  useJudgeInference,
  usePeople,
  useLabels,
  useSavePerson,
  type ShownInference,
} from '../../src/lib/memory';
import { usePreferences } from '../../src/lib/profile';

/**
 * Everything Suhail believes about someone, in one place they can argue with.
 *
 * This is the trust feature. An assistant that quietly accumulates conclusions
 * is one people stop telling things to, and the only defence is to show the
 * conclusions — including the half-formed ones, because a guess corrected
 * before it is acted on costs nobody anything.
 *
 * Nothing here is phrased as certainty it does not have. A signal seen four
 * times says so.
 */

function Row({
  inference,
  labels,
  onJudge,
  busy,
}: {
  inference: ShownInference;
  labels: Record<string, string>;
  onJudge: (correct: boolean) => void;
  busy: boolean;
}) {
  return (
    <View className="gap-3 py-5">
      <View className="gap-1">
        <Title>{describeInference(inference, labels)}</Title>
        <Meta>
          {confidenceWord(inference.confidence)}
          {inference.confirmedAt === null
            ? ` · from ${inference.observations} ${inference.observations === 1 ? 'time' : 'times'}`
            : ''}
        </Meta>
      </View>

      <View className="flex-row gap-6">
        <Pressable
          onPress={() => onJudge(true)}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel="That is right"
          className="min-h-[44px] justify-center"
        >
          <Body className={inference.confirmedAt !== null ? 'text-ink' : undefined}>
            {inference.confirmedAt !== null ? 'Confirmed' : "That's right"}
          </Body>
        </Pressable>
        <Pressable
          onPress={() => onJudge(false)}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel="Not quite"
          className="min-h-[44px] justify-center"
        >
          <Muted>Not quite</Muted>
        </Pressable>
      </View>

      <Rule />
    </View>
  );
}

export default function WhatSuhailKnows() {
  const router = useRouter();
  const preferences = usePreferences();
  const inferences = useInferences();
  const labels = useLabels();
  const people = usePeople();
  const judge = useJudgeInference();
  const savePerson = useSavePerson();
  const forgetPerson = useForgetPerson();

  const [name, setName] = useState('');
  const [relation, setRelation] = useState('');

  const all = inferences.data ?? [];
  const liked = all.filter((i) => i.leaning === 'toward');
  const avoided = all.filter((i) => i.leaning === 'against');

  const stated = preferences.data;
  const told = [
    ...(stated?.cuisines_loved ?? []),
    ...(stated?.dietary ?? []),
    ...(stated?.allergies ?? []),
  ];

  return (
    <ScreenScroll>
      <View className="gap-6">
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          className="min-h-[44px] justify-center"
        >
          <Meta>Back</Meta>
        </Pressable>
        <Display>What Suhail knows</Display>
        <Lead>Everything here can be corrected. Suhail stops assuming it the moment you do.</Lead>
      </View>

      <View className="gap-4">
        <Meta>You told me</Meta>
        {told.length > 0 ? (
          <View className="gap-1.5">
            {told.map((item) => (
              <Body key={item}>{item}</Body>
            ))}
            <Pressable
              onPress={() => router.push('/profile')}
              accessibilityRole="button"
              className="min-h-[44px] justify-center"
            >
              <Muted>Change these</Muted>
            </Pressable>
          </View>
        ) : (
          <Muted>Nothing yet. Your profile is where this starts.</Muted>
        )}
      </View>

      <View className="gap-2">
        <Meta>What you seem to like</Meta>

        {inferences.isLoading ? <LiveStatus label="Looking…" /> : null}

        {/*
          Empty is the honest state until somebody has chosen between real
          options. Saying so plainly beats an encouraging placeholder that
          implies the feature is broken.
        */}
        {inferences.isError ? (
          <Muted>I could not read this just now. Try again in a moment.</Muted>
        ) : null}

        {!inferences.isLoading && !inferences.isError && all.length === 0 ? (
          <Muted>
            Nothing yet. I learn from what you pick over what you pass on, so this fills in once you
            have booked a few things.
          </Muted>
        ) : null}

        {liked.map((inference) => (
          <Row
            key={inference.id}
            inference={inference}
            labels={labels.data ?? {}}
            busy={judge.isPending}
            onJudge={(correct) => judge.mutate({ id: inference.id, correct })}
          />
        ))}
      </View>

      {/*
        Kept apart, because a thing you pass over every time is not a weak
        version of a thing you choose. Listed together they read as faint
        praise for the exact opposite of what happened.
      */}
      {avoided.length > 0 ? (
        <View className="gap-2">
          <Meta>What you seem to avoid</Meta>
          {avoided.map((inference) => (
            <Row
              key={inference.id}
              inference={inference}
              labels={labels.data ?? {}}
              busy={judge.isPending}
              onJudge={(correct) => judge.mutate({ id: inference.id, correct })}
            />
          ))}
        </View>
      ) : null}

      <View className="gap-4">
        <Meta>People</Meta>
        <Muted>So &ldquo;dinner for me and Joanna&rdquo; means a table for two.</Muted>

        {(people.data ?? []).map((person) => (
          <View key={person.id} className="gap-1.5 py-2">
            <Title>{person.name}</Title>
            <Body className="text-grey">{person.relation}</Body>
            <Pressable
              onPress={() => forgetPerson.mutate(person.id)}
              disabled={forgetPerson.isPending}
              accessibilityRole="button"
              className="min-h-[44px] justify-center"
            >
              <Muted>Forget them</Muted>
            </Pressable>
            <Rule />
          </View>
        ))}

        <View className="gap-3">
          <TextField label="Name" value={name} onChangeText={setName} placeholder="Joanna" />
          <TextField
            label="Who they are"
            value={relation}
            onChangeText={setRelation}
            placeholder="wife"
            autoCapitalize="none"
          />
          <Button
            label="Add"
            disabled={name.trim().length === 0 || relation.trim().length === 0}
            loading={savePerson.isPending}
            onPress={() =>
              savePerson.mutate(
                { name, relation },
                {
                  onSuccess: () => {
                    setName('');
                    setRelation('');
                  },
                },
              )
            }
          />
          {savePerson.isError ? (
            <Body className="text-alert">
              {savePerson.error instanceof Error
                ? savePerson.error.message
                : 'Could not save that.'}
            </Body>
          ) : null}
        </View>
      </View>
    </ScreenScroll>
  );
}
