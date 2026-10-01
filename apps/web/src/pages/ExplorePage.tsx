import { SearchX, Search } from 'lucide-react';
import { useState } from 'react';
import { EventCard } from '../components/events/EventCard';
import { EmptyState } from '../components/ui/EmptyState';
import { ErrorState } from '../components/ui/ErrorState';
import { LoadingState } from '../components/ui/LoadingState';
import { PageHeader } from '../components/ui/PageHeader';
import { useEvents, useEventSearch } from '../hooks/queries';
import { useDebouncedValue } from '../hooks/useDebouncedValue';

export function ExplorePage() {
  const [input, setInput] = useState('');
  const query = useDebouncedValue(input.trim(), 200);
  const all = useEvents();
  const search = useEventSearch(query);
  const active = query ? search : all;
  const events = active.data;

  return (
    <div className="space-y-4">
      <PageHeader title="Explore" subtitle="Search events by name, town or region." />

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

      {active.isPending ? (
        <LoadingState rows={5} label="Loading events" />
      ) : active.isError ? (
        <ErrorState error={active.error} title="Events could not be loaded" onRetry={() => active.refetch()} />
      ) : !events || events.length === 0 ? (
        <EmptyState
          icon={SearchX}
          title={query ? `No events match “${query}”` : 'No events imported yet'}
          description={query ? 'Try a town or region name instead.' : 'Event data appears here once it has been imported.'}
        />
      ) : (
        <>
          <p className="text-xs text-muted" aria-live="polite">
            {events.length} {events.length === 1 ? 'event' : 'events'}
            {query ? ` matching “${query}”` : ''}
          </p>
          <ul className="space-y-2">
            {events.map((event) => (
              <li key={event.id}>
                <EventCard event={event} />
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
