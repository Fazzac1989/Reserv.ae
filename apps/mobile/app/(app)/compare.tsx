import { useState } from 'react';
import { Image, Pressable, ScrollView, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Feather } from '@expo/vector-icons';
import { BRAND } from '@reservai/config';
import {
  accessibilityStatusOf,
  availabilityLabelOf,
  availabilityStateOf,
  breakdownOf,
  canApprove,
  formatMoney,
  priceCaveat,
  totalOf,
  type OptionFacts,
} from '@reservai/core';
import { Rule, ScreenScroll } from '../../src/components/ui/screen';
import { Body, Display, Lead, Meta, Muted, Title } from '../../src/components/ui/text';
import { Button } from '../../src/components/ui/button';
import { LiveStatus } from '../../src/components/booking-state';
import { listOptions, type VenueOption } from '../../src/lib/options';
import { approveSuggestion } from '../../src/lib/agent';

function factsOf(option: VenueOption): OptionFacts {
  return {
    slotIsVerified: option.slotIsVerified,
    availabilityCheckedAt: option.availabilityCheckedAt,
    price: option.price,
    deposit: option.deposit,
    requiresDeposit: option.requiresDeposit,
    cancellationTerms: option.cancellationTerms,
  };
}

function clock(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function dayLabel(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

/** One labelled line. Renders nothing when there is nothing to say. */
function Line({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <View className="flex-row justify-between gap-6 py-1.5">
      <Meta className="flex-1">{label}</Meta>
      <Body className="flex-[1.4] text-right">{value}</Body>
    </View>
  );
}

/**
 * One option, as a card you can weigh against the one beside it.
 *
 * Every claim on this card is either a fact from the record or a label saying
 * we do not have one. The availability line is the load-bearing part: a venue
 * name and a photograph do not establish that a table exists, and this is the
 * only line on the card that addresses whether one does.
 */
function OptionCard({
  option,
  selected,
  onSelect,
}: {
  option: VenueOption;
  selected: boolean;
  onSelect: () => void;
}) {
  const facts = factsOf(option);
  const state = availabilityStateOf(facts);
  const where = [option.neighbourhood ?? option.zone.replace(/_/g, ' ')].filter(Boolean).join(' · ');

  const total = option.price
    ? totalOf([{ amount: option.price.amount, source: option.price.source, checkedAt: option.priceCheckedAt }])
    : null;
  const caveat = total ? priceCaveat(total) : null;
  const access = accessibilityStatusOf(option.accessibility);

  return (
    <Pressable
      onPress={onSelect}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`${option.name}, ${where}`}
      className={
        selected
          ? 'overflow-hidden rounded-card border-2 border-accent bg-paper-raised dark:bg-ink-raised'
          : 'overflow-hidden rounded-card border border-grey-line bg-paper-raised dark:bg-ink-raised'
      }
    >
      {option.photo ? (
        <Image
          source={{ uri: option.photo }}
          style={{ height: 150, backgroundColor: '#1C1613' }}
          resizeMode="cover"
        />
      ) : null}

      <View className="gap-3 p-5">
        <View className="gap-1">
          <Title numberOfLines={1}>{option.name}</Title>
          <Meta numberOfLines={1}>{[where, option.tags?.[0]].filter(Boolean).join(' · ')}</Meta>
        </View>

        {/* Why it fits, in the Curator's own words rather than a badge. */}
        <Body className="text-grey">{option.rationale}</Body>

        <Rule />

        <View>
          <Line label="When" value={`${dayLabel(option.proposedStart)}, ${clock(option.proposedStart)}`} />
          <Line
            label="Estimated total"
            value={total ? `${formatMoney(total.amount)}${caveat ? ` · ${caveat}` : ''}` : null}
          />
          <Line label="Deposit" value={option.deposit ? formatMoney(option.deposit) : null} />
          <Line
            label="Getting there"
            value={option.travelMinutes ? `About ${option.travelMinutes} minutes` : null}
          />
          <Line
            label="Access"
            value={
              access === 'recorded'
                ? option.accessibility.join(', ')
                : 'Not recorded — I can ask'
            }
          />
          <Line label="Cancellation" value={option.cancellationTerms} />
        </View>

        {/*
          The one line that says whether a table exists. Accented only when it
          is actually confirmed, because an accent on "available on request"
          would be a colour making a promise the words do not.
        */}
        <View className="flex-row items-center gap-2">
          <Feather
            name={state === 'confirmed' ? 'check-circle' : 'clock'}
            size={14}
            color={state === 'confirmed' ? '#DE8B63' : '#A08A80'}
          />
          <Meta className={state === 'confirmed' ? 'text-accent-text' : undefined}>
            {availabilityLabelOf(facts)}
          </Meta>
        </View>
      </View>
    </Pressable>
  );
}

/**
 * Compare, and then approve.
 *
 * Two or three options, side by side, with the same facts on each so they can
 * actually be weighed. What is not known stays visibly not known — an option
 * whose deposit nobody has established says so on its face rather than
 * rounding down to a confident blank.
 */
export default function Compare() {
  const { requestId } = useLocalSearchParams<{ requestId: string }>();
  const router = useRouter();
  const [chosen, setChosen] = useState<string | null>(null);

  const options = useQuery({
    queryKey: ['options', requestId],
    enabled: Boolean(requestId),
    queryFn: () => listOptions(requestId!),
  });

  const approve = useMutation({
    mutationFn: (suggestionId: string) => approveSuggestion(suggestionId),
    onSuccess: () => router.replace('/plans'),
  });

  const list = options.data ?? [];
  const selected = list.find((o) => o.id === chosen) ?? null;
  const check = selected ? canApprove(factsOf(selected)) : null;
  const breakdown = selected ? breakdownOf(factsOf(selected)) : null;

  return (
    <ScreenScroll>
      <View className="flex-row items-center justify-between pt-4">
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          className="min-h-[44px] justify-center"
        >
          <Meta>Back</Meta>
        </Pressable>
      </View>

      <View className="gap-3">
        <Display>Which one?</Display>
        <Lead className="text-grey">
          Nothing is booked until you choose. {BRAND.name} asks the venue after that.
        </Lead>
      </View>

      {options.isLoading ? <LiveStatus label="Looking…" /> : null}

      {options.isError ? (
        <Body className="text-alert">I could not load the options just now.</Body>
      ) : null}

      {!options.isLoading && !options.isError && list.length === 0 ? (
        <View className="gap-4">
          <Muted>
            No options for this request yet. Ask {BRAND.name} again and I will put some together.
          </Muted>
          <Pressable
            onPress={() => router.push('/suhail')}
            accessibilityRole="button"
            className="min-h-[44px] justify-center"
          >
            <Body className="font-body-medium">Ask {BRAND.name}</Body>
          </Pressable>
        </View>
      ) : null}

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerClassName="gap-3"
      >
        {list.map((option) => (
          <View key={option.id} style={{ width: 300 }}>
            <OptionCard
              option={option}
              selected={chosen === option.id}
              onSelect={() => setChosen(chosen === option.id ? null : option.id)}
            />
          </View>
        ))}
      </ScrollView>

      {/*
        The review, and the only place an approval can be given. It restates
        everything rather than assuming the card above is still on screen — a
        person scrolls, and agreeing to something you have to scroll back to
        read is not agreeing to it.
      */}
      {selected ? (
        <View className="gap-5 rounded-card border border-grey-line bg-paper-raised p-6 dark:bg-ink-raised">
          <View className="gap-1">
            <Meta>You are approving</Meta>
            <Title>{selected.name}</Title>
          </View>

          <View>
            <Line label="When" value={`${dayLabel(selected.proposedStart)}, ${clock(selected.proposedStart)}`} />
            <Line label="Total" value={breakdown?.total ? formatMoney(breakdown.total) : 'Not known yet'} />
            <Line label="Due now" value={breakdown?.dueNow ? formatMoney(breakdown.dueNow) : null} />
            <Line
              label="Due on the night"
              value={breakdown?.dueLater ? formatMoney(breakdown.dueLater) : null}
            />
            <Line label="Cancellation" value={selected.cancellationTerms} />
          </View>

          <Rule />

          {check && !check.ok ? (
            <>
              {/*
                Approving is the moment somebody takes on an obligation, and an
                obligation whose size we cannot state is one they cannot
                consent to. So the button is not merely disabled — the reason
                is on the screen next to it.
              */}
              <Body className="text-alert">{check.reason}</Body>
              <Button variant="commit" label="Cannot approve yet" disabled onPress={() => {}} />
            </>
          ) : (
            <>
              <Button
                variant="commit"
                label={
                  selected.deposit
                    ? `Approve — ${formatMoney(selected.deposit)} deposit`
                    : `Approve and let ${BRAND.name} ask`
                }
                loading={approve.isPending}
                disabled={approve.isPending}
                onPress={() => approve.mutate(selected.id)}
              />

              {/*
                Said plainly, and true in production rather than only in a demo:
                there is no payment integration in this product. A deposit
                shown here is what the venue will ask for, not something Reserv
                is about to take.
              */}
              {selected.deposit ? (
                <Muted>
                  {BRAND.name} cannot take payment. Approving tells the venue you accept an{' '}
                  {formatMoney(selected.deposit)} deposit — they will ask you for it directly, and
                  nothing is charged here.
                </Muted>
              ) : (
                <Muted>
                  Approving lets {BRAND.name} ask the venue. Nothing is held until they say yes.
                </Muted>
              )}
            </>
          )}

          {approve.isError ? (
            <Body className="text-alert">
              That did not go through. Nothing has been sent — try again.
            </Body>
          ) : null}
        </View>
      ) : null}
    </ScreenScroll>
  );
}
