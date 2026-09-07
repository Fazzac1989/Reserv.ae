import { useRouter } from 'expo-router';
import { Directory } from '../../src/components/directory';

/**
 * Discover, for somebody already signed in.
 *
 * The screen itself is the shared `Directory` — the same one a stranger sees
 * at the front door — and all this adds is what a tap does. Signed in, a venue
 * opens the conversation with Suhail, because the assistant is the fastest way
 * from "that one" to a table.
 */
export default function Discover() {
  const router = useRouter();

  return (
    <Directory
      onOpen={(listing) =>
        router.push({ pathname: '/suhail', params: { ask: `Tell me about ${listing.name}` } })
      }
    />
  );
}
