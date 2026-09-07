import { Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Meta } from './ui/text';
import { useSavedIds, useToggleSaved } from '../lib/saved';
import { useSession } from '../store/session';
import { rememberIntent } from '../store/intent';

/**
 * Keep, or Kept.
 *
 * A word rather than a heart. The design system says no icons where a word is
 * clearer, and here a word is clearer twice over: an outline heart and a
 * filled one are the same shape at a glance, and "Kept" says what happened
 * where a filled heart only says something happened.
 *
 * Signed out it is not hidden and not disabled. Hiding it would mean the
 * feature does not exist until you have an account, which is the opposite of
 * what a public directory is for; pressing it asks who you are and brings you
 * back, the same route the booking button takes.
 */
export function SaveButton({
  venueId,
  venueName,
  className,
}: {
  venueId: string;
  venueName: string;
  className?: string;
}) {
  const router = useRouter();
  const session = useSession();
  const savedIds = useSavedIds();
  const toggle = useToggleSaved();

  const saved = savedIds.data?.has(venueId) ?? false;

  function press() {
    if (!session) {
      rememberIntent(venueId, venueName);
      router.push('/(auth)/sign-in');
      return;
    }
    toggle.mutate({ venueId, saved });
  }

  return (
    <Pressable
      onPress={press}
      accessibilityRole="button"
      accessibilityState={{ selected: saved }}
      accessibilityLabel={saved ? `Remove ${venueName} from saved` : `Save ${venueName}`}
      className={`min-h-[44px] justify-center ${className ?? ''}`}
    >
      <Meta className={saved ? 'text-ink dark:text-paper' : undefined}>
        {saved ? 'Kept' : 'Keep'}
      </Meta>
    </Pressable>
  );
}
