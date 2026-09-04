import { useState } from 'react';
import { ImageBackground, Modal, Pressable, ScrollView, View } from 'react-native';
import { Button } from './ui/button';
import { Chip } from './ui/chip';
import { Rule } from './ui/screen';
import { Lead, Meta, Muted, Title } from './ui/text';
import { metaLine } from './venue-card';
import { useMotion } from '../lib/motion';
import type { SuggestionCard } from '../lib/agent';

function clock(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function dayLabel(iso: string): string {
  const when = new Date(iso);
  const today = new Date();
  const sameDay = when.toDateString() === today.toDateString();
  if (sameDay) return 'Tonight';
  return when.toLocaleDateString('en-GB', { weekday: 'long' });
}

/**
 * A card opened, not a screen navigated to.
 *
 * The times are a list because they will be one — a rail that can read
 * availability returns several. Today the Curator proposes a single slot, and
 * showing invented alternatives beside it would be the one lie this product
 * cannot tell, so one proposal renders as one pill.
 */
export function VenueSheet({
  card,
  onClose,
  onReserve,
  reserving,
}: {
  card: SuggestionCard | null;
  onClose: () => void;
  onReserve: (card: SuggestionCard) => void;
  reserving: boolean;
}) {
  const animate = useMotion();
  const times = card ? [card.proposedStart] : [];
  const [chosen, setChosen] = useState<string | null>(null);
  const time = chosen ?? times[0] ?? null;

  if (!card) return null;

  const photo = card.photoUrls?.[0];

  return (
    <Modal
      visible
      transparent
      animationType={animate ? 'slide' : 'none'}
      onRequestClose={onClose}
      accessibilityViewIsModal
    >
      <Pressable className="flex-1 bg-ink/50" onPress={onClose} accessibilityLabel="Close" />

      <View className="max-h-[88%] overflow-hidden rounded-t-[28px] bg-paper dark:bg-ink">
        <ScrollView showsVerticalScrollIndicator={false}>
          {photo ? (
            <ImageBackground source={{ uri: photo }} className="h-72" resizeMode="cover">
              <View className="absolute inset-x-0 bottom-0 h-1/2 bg-ink/25" />
              <View className="absolute inset-x-0 bottom-0 h-1/3 bg-ink/50" />
              <View className="flex-1 justify-end p-7">
                <Title className="text-paper">{card.name}</Title>
                <Meta className="mt-1.5 text-paper/70">{metaLine(card)}</Meta>
              </View>
            </ImageBackground>
          ) : (
            <View className="gap-1.5 px-7 pt-8">
              <Title>{card.name}</Title>
              <Meta>{metaLine(card)}</Meta>
            </View>
          )}

          <View className="gap-7 p-7">
            <Lead>{card.houseNote ?? card.rationale}</Lead>

            <View className="gap-3.5">
              <Meta>{dayLabel(card.proposedStart)}</Meta>
              <View className="flex-row flex-wrap gap-2">
                {times.map((t) => (
                  <Chip
                    key={t}
                    label={clock(t)}
                    selected={t === time}
                    onPress={() => setChosen(t)}
                  />
                ))}
              </View>
              {/*
                Said plainly at the point of deciding, not buried after. Nothing
                has been asked of the venue yet, and the difference between "I
                will ask for 8:30" and "8:30 is yours" is the whole product.
              */}
              {!card.slotIsVerified ? (
                <Muted>I will ask for this. Nothing is held until they say yes.</Muted>
              ) : null}
            </View>

            <Rule />

            {/*
              The moment of commitment, and the only solid surface on the sheet.
              The label names the time so the tap is never ambiguous.
            */}
            <Button
              variant="commit"
              label={time ? `Reserve ${clock(time)}` : 'Reserve'}
              loading={reserving}
              onPress={() => onReserve(card)}
            />

            <Pressable onPress={onClose} accessibilityRole="button" className="items-center py-1">
              <Muted>Not this one</Muted>
            </Pressable>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}
