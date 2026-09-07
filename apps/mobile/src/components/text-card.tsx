import { View } from 'react-native';
import { Display, Meta, Muted, Title } from './ui/text';

/**
 * A venue with no photograph, done properly.
 *
 * Most venues in the directory will not have a picture for a long time. A
 * listing is factual information about a business and needs nobody's
 * permission; their photographs are theirs, and we do not get to use them
 * until they have claimed the listing and given them to us. So the text card
 * is not a fallback for an unusual case — it is the card most of the
 * directory will wear, and it has to hold its own beside a photograph.
 *
 * The one move that makes it work is inverting the layout. A photographic
 * card puts its name at the bottom, over the scrim. Copy that here and the
 * top two-thirds is an empty box with writing at the bottom, which reads
 * exactly like an image that failed to load. Set from the top instead, with
 * the tags pinned to the foot, and the same rectangle reads as a page: the
 * space in the middle looks chosen rather than missing.
 *
 * The note is doing the photograph's job — telling you what kind of room this
 * is — so it gets the room to do it, and there are no icons or placeholder
 * graphics anywhere near it.
 */
export function TextCard({
  name,
  meta,
  note,
  tags = [],
  height,
  large = false,
}: {
  name: string;
  meta: string;
  note?: string | null;
  tags?: string[];
  height: number;
  large?: boolean;
}) {
  const Name = large ? Display : Title;

  return (
    <View
      style={{ height }}
      className="gap-3 rounded-card border border-grey-line bg-paper-raised p-6 dark:bg-ink-raised"
    >
      <Meta>{meta}</Meta>
      <Name>{name}</Name>

      {note ? (
        // Clamped rather than scrolled: a card is a glance, and a paragraph
        // that runs to the edge of one looks like a mistake in a design that
        // spends this much on whitespace.
        <Muted numberOfLines={large ? 6 : 4}>{note}</Muted>
      ) : null}

      <View className="flex-1" />

      {tags.length > 0 ? (
        <View className="gap-3">
          <View className="h-px w-full bg-grey-line" />
          {/*
            One line. Letterspaced uppercase wraps sooner than it looks like it
            will, and a second line pushes the rule up so the card no longer
            lines up with the one beside it — which is the whole thing this
            card is trying not to do.
          */}
          <Meta numberOfLines={1}>{tags.slice(0, 3).join(' · ')}</Meta>
        </View>
      ) : null}
    </View>
  );
}
