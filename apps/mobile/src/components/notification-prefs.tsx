import { Pressable, View } from 'react-native';
import { Body, Muted } from './ui/text';

/**
 * Notification controls.
 *
 * Each switch says plainly what it turns off, because the point of the setting
 * is that someone can stop a specific thing without turning everything off and
 * then missing a reminder about a table they booked.
 */

export interface NotificationPrefs {
  push_enabled: boolean;
  whatsapp_enabled: boolean;
  reminder_24h: boolean;
  reminder_2h: boolean;
  proactive_suggestions: boolean;
}

const CONTROLS: {
  key: keyof NotificationPrefs;
  label: string;
  detail: string;
  /** Off unless asked for. Everything else defaults on. */
  optIn?: boolean;
}[] = [
  {
    key: 'push_enabled',
    label: 'Notifications',
    detail: 'Everything below needs this on.',
  },
  {
    key: 'reminder_24h',
    label: 'The day before',
    detail: 'A reminder the day before a booking.',
  },
  {
    key: 'reminder_2h',
    label: 'Two hours before',
    detail: 'A nudge shortly before you need to leave.',
  },
  {
    key: 'proactive_suggestions',
    label: 'Suggestions I did not ask for',
    detail: 'When you are about due somewhere you go regularly. At most a few a month.',
    optIn: true,
  },
];

function Toggle({ on, disabled }: { on: boolean; disabled: boolean }) {
  return (
    <View
      className={
        on && !disabled
          ? 'h-7 w-12 justify-center rounded-full bg-ink px-0.5 dark:bg-porcelain'
          : 'h-7 w-12 justify-center rounded-full bg-stone-line px-0.5 bg-stone-line'
      }
    >
      <View
        className={
          on && !disabled
            ? 'h-6 w-6 self-end rounded-full bg-porcelain dark:bg-ink'
            : 'h-6 w-6 self-start rounded-full bg-porcelain dark:bg-ink-raised'
        }
      />
    </View>
  );
}

export function NotificationPrefsControl({
  prefs,
  onChange,
  busy,
}: {
  prefs: NotificationPrefs;
  onChange: (next: NotificationPrefs) => void;
  busy: boolean;
}) {
  return (
    <View className="gap-3">
      <Muted>Notifications</Muted>

      {CONTROLS.map((control) => {
        // Everything hangs off the master switch, and showing the others as
        // live when they cannot fire would be a lie.
        const dependent = control.key !== 'push_enabled';
        const disabled = busy || (dependent && !prefs.push_enabled);
        const value = prefs[control.key];

        return (
          <Pressable
            key={control.key}
            disabled={disabled}
            onPress={() => onChange({ ...prefs, [control.key]: !value })}
            accessibilityRole="switch"
            accessibilityState={{ checked: value, disabled }}
            accessibilityLabel={control.label}
            className={
              disabled
                ? 'flex-row items-center gap-4 rounded-card border border-stone-line px-5 py-4 opacity-40 border-stone-line'
                : 'flex-row items-center gap-4 rounded-card border border-stone-line px-5 py-4 border-stone-line'
            }
          >
            <View className="flex-1 gap-0.5">
              <Body className="font-body-medium text-ink dark:text-porcelain">{control.label}</Body>
              <Muted>{control.detail}</Muted>
            </View>
            <Toggle on={value} disabled={disabled} />
          </Pressable>
        );
      })}

      <Muted>
        Reminders about bookings you made are on by default. Suggestions you did not ask for are not
        — that one is opt-in.
      </Muted>
    </View>
  );
}
