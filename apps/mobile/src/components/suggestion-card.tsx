import { Pressable, View } from 'react-native';
import { Body, Caption, Title } from './ui/text';
import type { SuggestionCard as Card } from '../lib/agent';

const BANDS = ['', 'Everyday', 'Comfortable', 'Upmarket', 'Occasion'];

/**
 * One option.
 *
 * The proposed time is described as a proposal, never as a held table.
 * Nothing has been asked of the venue at this point, and the difference
 * between "I'll ask for 8pm" and "8pm is booked" is the whole product.
 */
export function SuggestionCardView({
  card,
  onApprove,
  disabled,
}: {
  card: Card;
  onApprove: () => void;
  disabled: boolean;
}) {
  const when = new Date(card.proposedStart);

  return (
    <View className="gap-3 rounded-2xl border border-paper-line bg-paper-raised p-5 dark:border-night-line dark:bg-night-raised">
      <View className="gap-1">
        <Title>{card.name}</Title>
        <Caption>
          {card.zone.replace(/_/g, ' ')} · {BANDS[card.priceBand] ?? `band ${card.priceBand}`}
          {card.tags.length > 0 ? ` · ${card.tags.slice(0, 3).join(', ')}` : ''}
        </Caption>
      </View>

      <Body>{card.rationale}</Body>

      <View className="gap-1 border-t border-paper-line pt-3 dark:border-night-line">
        <Caption>
          {card.slotIsVerified ? 'Available at' : 'I will ask for'}{' '}
          {when.toLocaleString('en-GB', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            hour: '2-digit',
            minute: '2-digit',
          })}
        </Caption>
        {!card.slotIsVerified ? (
          <Caption className="text-ink-faint">
            Nothing is held yet — I will confirm once the venue does.
          </Caption>
        ) : null}
      </View>

      <Pressable
        onPress={onApprove}
        disabled={disabled}
        accessibilityRole="button"
        className={
          disabled
            ? 'h-12 items-center justify-center rounded-xl bg-ink opacity-40 dark:bg-paper'
            : 'h-12 items-center justify-center rounded-xl bg-ink dark:bg-paper'
        }
      >
        <Body className="font-medium text-paper dark:text-ink">Book this one</Body>
      </Pressable>
    </View>
  );
}
