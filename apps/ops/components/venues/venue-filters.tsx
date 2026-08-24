'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import { Search, X } from 'lucide-react';
import { ONBOARDING_STATUSES, VERTICALS, ZONES, labelFor } from '../../lib/venues/constants';
import { Input } from '../ui/input';
import { Button } from '../ui/button';

const SELECTS = [
  { name: 'status', label: 'Any status', options: ONBOARDING_STATUSES },
  { name: 'vertical', label: 'Any vertical', options: VERTICALS },
  { name: 'zone', label: 'Any zone', options: ZONES },
] as const;

/**
 * Filters live in the URL, so a filtered view is shareable and the back button
 * behaves. Text search is debounced; the selects apply immediately.
 */
export function VenueFiltersBar() {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [q, setQ] = useState(params.get('q') ?? '');

  function apply(next: URLSearchParams) {
    const query = next.toString();
    startTransition(() => router.replace(query ? `/venues?${query}` : '/venues'));
  }

  function setParam(name: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(name, value);
    else next.delete(name);
    apply(next);
  }

  // Debounce so typing does not fire a query per keystroke. The search term is
  // read back out of the URL rather than held as the source of truth, so the
  // back button and a shared link both restore the right box contents.
  const currentQ = params.get('q') ?? '';
  useEffect(() => {
    if (q === currentQ) return;
    const timer = setTimeout(() => {
      const next = new URLSearchParams(params.toString());
      if (q) next.set('q', q);
      else next.delete('q');
      const query = next.toString();
      startTransition(() => router.replace(query ? `/venues?${query}` : '/venues'));
    }, 300);
    return () => clearTimeout(timer);
  }, [q, currentQ, params, router]);

  const hasFilters = ['q', 'status', 'vertical', 'zone', 'needsChannel'].some((k) => params.get(k));

  return (
    <div className="flex flex-wrap items-center gap-2" data-pending={pending ? '' : undefined}>
      <div className="relative min-w-56 flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by name"
          aria-label="Search venues by name"
          className="pl-9"
        />
      </div>

      {SELECTS.map((select) => (
        <select
          key={select.name}
          aria-label={select.label}
          value={params.get(select.name) ?? ''}
          onChange={(e) => setParam(select.name, e.target.value)}
          className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
        >
          <option value="">{select.label}</option>
          {select.options.map((option) => (
            <option key={option} value={option}>
              {labelFor(option)}
            </option>
          ))}
        </select>
      ))}

      {/*
        The acquisition backlog: venues we can only reach by a human picking up
        the phone. These are the ones worth chasing for a real channel.
      */}
      <label className="flex h-9 items-center gap-2 rounded-md border border-input px-3 text-sm">
        <input
          type="checkbox"
          checked={params.get('needsChannel') === '1'}
          onChange={(e) => setParam('needsChannel', e.target.checked ? '1' : '')}
          className="h-3.5 w-3.5"
        />
        Manual only
      </label>

      {hasFilters ? (
        <Button variant="ghost" size="sm" onClick={() => apply(new URLSearchParams())}>
          <X />
          Clear
        </Button>
      ) : null}
    </div>
  );
}
