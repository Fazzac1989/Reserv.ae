import { ImageBackground, Pressable, View } from 'react-native';
import { Meta, Title } from './ui/text';
import { TextCard } from './text-card';
import type { SuggestionCard } from '../lib/agent';

const BANDS = ['', 'Everyday', 'Comfortable', 'Upmarket', 'Occasion'];

/** Dubai Marina, not dubai_marina. */
export function zoneLabel(zone: string): string {
  return zone.replace(/_/g, ' ');
}

export function metaLine(card: SuggestionCard): string {
  return [zoneLabel(card.zone), BANDS[card.priceBand]].filter(Boolean).join(' · ');
}

/**
 * One option, as a photograph with a name on it.
 *
 * Photography is the only decoration the design allows, so the card is the
 * picture — the scrim exists to carry the serif, not to darken the image for
 * its own sake.
 *
 * Where a venue has no photograph it gets the text card instead, the same one
 * the directory uses. Most venues will not have a picture for a long time, so
 * this is not an edge case to be tidied away: a suggestion Suhail is genuinely
 * proud of has to look composed whether or not we happen to hold an image of
 * the room.
 */
export function VenueCard({
  card,
  onPress,
  width,
}: {
  card: SuggestionCard;
  onPress: () => void;
  width: number;
}) {
  const photo = card.photoUrls?.[0];

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${card.name}, ${metaLine(card)}`}
      style={{ width }}
      className="h-64 overflow-hidden rounded-card"
    >
      {photo ? (
        <ImageBackground source={{ uri: photo }} className="flex-1" resizeMode="cover">
          {/*
            Ink at 0 to 55%, bottom-weighted. Three stops rather than two so the
            fade does not band on a wide gamut screen.
          */}
          <View className="absolute inset-x-0 bottom-0 h-1/2 bg-ink/20" />
          <View className="absolute inset-x-0 bottom-0 h-1/3 bg-ink/40" />
          <View className="absolute inset-x-0 bottom-0 h-1/4 bg-ink/55" />
          <View className="flex-1 justify-end p-5">
            <Title className="text-paper">{card.name}</Title>
            <Meta className="mt-1.5 text-paper/70">{metaLine(card)}</Meta>
          </View>
        </ImageBackground>
      ) : (
        <TextCard
          name={card.name}
          meta={metaLine(card)}
          note={card.houseNote ?? card.rationale}
          tags={card.tags}
          height={256}
        />
      )}
    </Pressable>
  );
}
