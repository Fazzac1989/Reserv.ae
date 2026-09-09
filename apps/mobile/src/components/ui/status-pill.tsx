import { View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Meta } from './text';

/**
 * Confirmed, or waiting, or neither.
 *
 * Colour here is doing real work rather than decoration. "Confirmed" and
 * "awaiting the venue" are the two states somebody scans this app for, and
 * telling them apart by reading is slower than telling them apart at a glance.
 *
 * Amber rather than red for waiting: nothing has gone wrong, it simply has not
 * happened yet. Red would make an ordinary Tuesday afternoon look like a
 * problem, and an app that cries wolf about waiting is one whose real problems
 * go unnoticed.
 *
 * Colour is never the only signal. Each tone carries its own icon and its own
 * words, because roughly one man in twelve cannot reliably separate the green
 * from the amber, and a status that depends on that distinction is a status
 * they cannot read.
 */
export type StatusTone = 'confirmed' | 'waiting' | 'attention' | 'quiet';

const TONE: Record<
  StatusTone,
  { text: string; bg: string; icon: keyof typeof Feather.glyphMap; iconColour: string }
> = {
  confirmed: {
    text: 'text-accent',
    bg: 'bg-accent-panel',
    icon: 'check-circle',
    iconColour: '#183F35',
  },
  waiting: {
    text: 'text-pending',
    bg: 'bg-pending-panel',
    icon: 'clock',
    iconColour: '#C77D3A',
  },
  attention: {
    text: 'text-alert',
    bg: 'bg-alert-panel',
    icon: 'alert-circle',
    iconColour: '#C2453D',
  },
  quiet: {
    text: 'text-grey',
    bg: '',
    icon: 'circle',
    iconColour: '#8A8F86',
  },
};

export function StatusPill({ tone, label }: { tone: StatusTone; label: string }) {
  const style = TONE[tone];

  return (
    <View
      accessibilityRole="text"
      accessibilityLabel={label}
      className={`flex-row items-center gap-1.5 self-start rounded-input px-2.5 py-1 ${style.bg}`}
    >
      <Feather name={style.icon} size={12} color={style.iconColour} />
      <Meta className={`tracking-[0.6px] ${style.text}`}>{label}</Meta>
    </View>
  );
}

/**
 * Which tone a status deserves.
 *
 * Takes the tone `statusCopy` already worked out rather than reading the
 * booking state a second time. The first version of this switched on the state
 * itself, which meant two functions decided what `escalated` means and only
 * one of them would be updated when a state was added — the same shape of bug
 * as the hand-written state lists that let a venue's counter-offer go
 * unnoticed.
 *
 * `confirmed` is the only tone that earns the green, and that is the whole
 * point of the colour: a venue has said yes and there is evidence for it.
 */
export function toneForCopy(tone: 'settled' | 'working' | 'attention' | 'closed'): StatusTone {
  if (tone === 'settled') return 'confirmed';
  if (tone === 'attention') return 'attention';
  if (tone === 'closed') return 'quiet';
  return 'waiting';
}
