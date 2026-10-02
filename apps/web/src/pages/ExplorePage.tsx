import type { EventSummary } from '@runsaturday/shared';
import { Flag, Search, SearchX, X } from 'lucide-react';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { EventCard } from '../components/events/EventCard';
import { ChallengeProgressCard } from '../components/explore/ChallengeProgressCard';
import { ChoiceChips } from '../components/ui/ChoiceChips';
import { EmptyState } from '../components/ui/EmptyState';
import { ErrorState } from '../components/ui/ErrorState';
import { LoadingState } from '../components/ui/LoadingState';
import { PageHeader } from '../components/ui/PageHeader';
import { useChallengeOpportunities, useEvents, useEventSearch, useExploreSummary } from '../hooks/queries';
import { useDebouncedValue } from '../hooks/useDebouncedValue';

/** Visit filters. Visited status is derived on the server from the user's performances. */
const SHOW_OPTIONS = [
  { value: 'all', label: 'All events' },
  { value: 'not_visited', label: 'Not visited' },
  { value: 'visited', label: 'Visited' },
  { value: 'favourites', label: 'Favourites' },
] as const;
type Show = (typeof SHOW_OPTIONS)[number]['value'];

const SHOW_FILTER: Record<Show, (e: EventSummary) => boolean> = {
  all: () => true,
  not_visited: (e) => e.visited === false,
  visited: (e) => e.visited === true,
  favourites: (e) => e.favourite === true,
};

const EMPTY_TEXT: Record<Show, string> = {
  all: 'No events',
  not_visited: 'You have visited every event here',
  visited: 'No visited events here yet',
  favourites: 'No saved events here yet',
};

const isShow = (v: string | null): v is Show => SHOW_OPTIONS.some((o) => o.value === v);

/**
 * Explore: discovery first. Search, visit filters and an optional challenge filter
 * (?challenge=<id>&item=<key>, generic for any challenge kind). Performance scores stay on the
 * event page and the Saturday tools.
 */
export function ExplorePage() {
  const [params, setParams] = useSearchParams();
  const [input, setInput] = useState('');
  const query = useDebouncedValue(input.trim(), 200);
  const showParam = params.get('show');
  const show: Show = isShow(showParam) ? showParam : 'all';
  const challenge = params.get('challenge');
  const item = params.get('item');
  const filter = challenge && item ? { challenge, item } : null;

  const all = useEvents();
  const search = useEventSearch(filter ? '' : query);
  const opportunities = useChallengeOpportunities(filter);
  const active = filter ? opportunities : query ? search : all;
  const { data: summary } = useExploreSummary();

  const base = filter ? opportunities.data?.events : (active.data as EventSummary[] | undefined);
  const q = query.toLowerCase();
  const events = base
    ?.filter(SHOW_FILTER[show])
    .filter((e) => !filter || !q || [e.name, e.town, e.region].some((v) => v?.toLowerCase().includes(q)));

  const update = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) {
      if (v == null) next.delete(k);
      else next.set(k, v);
    }
    setParams(next, { replace: true, preventScrollReset: true });
  };

  return (
    <div className="space-y-4">
      <PageHeader title="Explore" subtitle="Discover events, see where you have been and progress your challenges." />

      {summary && !filter && (
        <section aria-label="Your exploring" className="space-y-2">
          <p className="text-sm text-muted">
            <strong className="text-ink tabular-nums">{summary.eventsVisited}</strong> {summary.eventsVisited === 1 ? 'event' : 'events'} visited
            <span className="text-subtle"> · {summary.eventsInDataset} {summary.eventsInDataset === 1 ? 'event' : 'events'} available</span>
          </p>
          {summary.challenges.slice(0, 1).map((c) => (
            <ChallengeProgressCard key={c.id} challenge={c} compact />
          ))}
          <Link to="/challenges" className="inline-flex min-h-9 items-center gap-1 text-sm font-semibold text-brand-700">
            <Flag className="size-4" aria-hidden />
            My Challenges
          </Link>
        </section>
      )}

      {filter && (
        <section aria-label="Challenge filter" className="flex items-start justify-between gap-3 rounded-2xl border border-brand-700 bg-brand-50 px-3 py-2.5 text-sm">
          <div className="min-w-0">
            <p className="font-semibold text-brand-800">{opportunities.data?.item.challengeName ?? 'Challenge'}</p>
            <p className="text-brand-800">
              Looking for: <strong>{opportunities.data?.item.itemLabel ?? item}</strong>
            </p>
          </div>
          <button
            type="button"
            onClick={() => update({ challenge: null, item: null })}
            className="inline-flex min-h-9 shrink-0 items-center gap-1 rounded-full border border-brand-700 bg-surface px-3 text-xs font-semibold text-brand-800"
          >
            <X className="size-3.5" aria-hidden />
            Clear challenge filter
          </button>
        </section>
      )}

      <label className="relative block">
        <span className="sr-only">Search events</span>
        <Search className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-subtle" aria-hidden />
        <input
          type="search"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Event, town or region"
          autoComplete="off"
          className="min-h-12 w-full rounded-full border border-line bg-surface pr-4 pl-11 text-base placeholder:text-subtle focus:border-brand-700 focus:outline-none"
        />
      </label>

      <ChoiceChips label="Show" options={[...SHOW_OPTIONS]} value={show} onChange={(v) => update({ show: v === 'all' ? null : v })} />

      {active.isPending ? (
        <LoadingState rows={5} label="Loading events" />
      ) : active.isError ? (
        <ErrorState error={active.error} title="Events could not be loaded" onRetry={() => active.refetch()} />
      ) : !events || events.length === 0 ? (
        filter ? (
          <EmptyState
            icon={SearchX}
            title={opportunities.data?.completed ? `You already have ${item}` : `No ${item} events in 5K Compass yet`}
            description={
              opportunities.data?.completed
                ? 'This item is complete. Clear the filter to keep exploring.'
                : 'No event in the current dataset matches this challenge item. More events may be added later.'
            }
          />
        ) : (
          <EmptyState
            icon={SearchX}
            title={query ? `No events match “${query}”` : EMPTY_TEXT[show]}
            description={query ? 'Try a town or region name instead.' : show === 'all' ? 'Event data appears here once it has been imported.' : 'Try another filter.'}
          />
        )
      ) : (
        <>
          <p className="text-xs text-muted" aria-live="polite">
            {events.length} {events.length === 1 ? 'event' : 'events'}
            {query ? ` matching “${query}”` : ''}
          </p>
          <ul className="space-y-2">
            {events.map((event) => (
              <li key={event.id}>
                <EventCard event={event} variant="explore" />
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
