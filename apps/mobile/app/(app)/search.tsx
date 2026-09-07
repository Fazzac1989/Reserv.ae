import { useLocalSearchParams, useRouter } from 'expo-router';
import { VenueSearch } from '../../src/components/venue-search';
import type { VenueFilters } from '../../src/lib/venues';

/**
 * Results, with the query and the filters in the URL.
 *
 * That is the whole reason this is a route rather than a sheet. The brief asks
 * that opening a venue and coming back returns you to the same results, and
 * the way to get that for free is to keep the state somewhere the router
 * already restores — which is the address, not a component that unmounts.
 */
export default function Search() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    q?: string;
    zone?: string;
    vertical?: string;
    bandMax?: string;
    outdoor?: string;
    view?: string;
    dietary?: string;
  }>();

  const initial: VenueFilters = {
    q: params.q,
    zone: params.zone,
    vertical: params.vertical,
    bandMax: params.bandMax ? Number(params.bandMax) : undefined,
    outdoor: params.outdoor === '1' ? true : undefined,
    view: params.view === '1' ? true : undefined,
    dietary: params.dietary,
  };

  return (
    <VenueSearch
      initial={initial}
      onFiltersChange={(f) => {
        /*
         * Replaced rather than merged.
         *
         * `setParams` merges, so clearing a filter means writing it back as an
         * empty string — which leaves `?q=sushi&vertical=&bandMax=&view=` in
         * the address bar. That is what somebody copies when they share a
         * search and what a crawler would index. Building the href from only
         * the filters that are set, and replacing, drops a cleared filter
         * instead of blanking it.
         *
         * `replace` rather than `push` so that changing four filters does not
         * leave four entries in the history for the back button to walk.
         */
        const params = new URLSearchParams();
        if (f.q) params.set('q', f.q);
        if (f.zone) params.set('zone', f.zone);
        if (f.vertical) params.set('vertical', f.vertical);
        if (f.bandMax) params.set('bandMax', String(f.bandMax));
        if (f.outdoor) params.set('outdoor', '1');
        if (f.view) params.set('view', '1');
        if (f.dietary) params.set('dietary', f.dietary);

        const query = params.toString();
        router.replace(query ? `/search?${query}` : '/search');
      }}
      onOpen={(venue) => router.push(`/venue/${venue.slug ?? venue.id}`)}
      onAsk={(text) => router.push({ pathname: '/suhail', params: { ask: text } })}
    />
  );
}
