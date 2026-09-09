import { useRouter } from 'expo-router';
import { Directory } from '../../src/components/directory';

/**
 * The catalogue, as its own screen again.
 *
 * It was a tab, then it was absorbed into Home, and now it is neither: a
 * screen reached from Today rather than a destination competing with it. The
 * reasoning changed with the product. When the promise was "find somewhere",
 * the directory was the front page. The promise is "your plans, taken care
 * of", and a front page of restaurants answers a question nobody opened the
 * app to ask.
 *
 * It is still a full screen rather than a strip, because browsing is a real
 * thing people do and a shelf of six inside Today is not browsing.
 */
export default function DiscoverScreen() {
  const router = useRouter();

  return <Directory onOpen={(listing) => router.push(`/venue/${listing.slug ?? listing.id}`)} />;
}
