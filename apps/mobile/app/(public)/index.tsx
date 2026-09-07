import { useRouter } from 'expo-router';
import { Directory } from '../../src/components/directory';

/**
 * The front door, for somebody who has never signed in.
 *
 * The same directory a member sees, because there is no reason a stranger
 * should be shown a worse version of the thing we want them to want. What
 * differs is only where a tap goes: a member goes to Suhail, who can act; a
 * visitor goes to the venue's own page, which is the thing that can be linked
 * to and the place the question "shall I book this?" gets asked.
 */
export default function PublicDirectory() {
  const router = useRouter();

  return <Directory onOpen={(listing) => router.push(`/venue/${listing.slug ?? listing.id}`)} />;
}
