import { COMPARE_MAX_EVENTS, type EventSummary } from '@runsaturday/shared';
import { Check, Plus, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '../ui/Button';

interface EventPickerProps {
  events: EventSummary[];
  selected: string[];
  onToggle: (id: string) => void;
  onDone: () => void;
}

/** Inline, searchable list for choosing up to four events. Large touch targets; state shown by icon and text. */
export function EventPicker({ events, selected, onToggle, onDone }: EventPickerProps) {
  const [query, setQuery] = useState('');
  const full = selected.length >= COMPARE_MAX_EVENTS;
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? events.filter((e) => [e.name, e.town].some((f) => f?.toLowerCase().includes(q))) : events;
    return [...list].sort((a, b) => (a.travel?.minutes ?? Infinity) - (b.travel?.minutes ?? Infinity));
  }, [events, query]);

  return (
    <section aria-label="Choose events to compare" className="rounded-3xl border border-line bg-surface p-3">
      <label className="relative block">
        <span className="sr-only">Search events</span>
        <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-subtle" aria-hidden />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search events"
          className="min-h-11 w-full rounded-full border border-line bg-canvas pr-4 pl-10 text-base placeholder:text-subtle focus:border-brand-700 focus:outline-none"
        />
      </label>
      <p className="mt-2 px-1 text-xs text-muted" aria-live="polite">
        {selected.length} of {COMPARE_MAX_EVENTS} selected{full ? ' · remove one to add another' : ''}
      </p>
      <ul className="mt-1 max-h-72 divide-y divide-line overflow-y-auto">
        {visible.map((e) => {
          const isSelected = selected.includes(e.id);
          const disabled = !isSelected && full;
          return (
            <li key={e.id}>
              <button
                type="button"
                aria-pressed={isSelected}
                disabled={disabled}
                onClick={() => onToggle(e.id)}
                className="flex min-h-12 w-full items-center gap-3 px-1 py-2 text-left disabled:opacity-40"
              >
                <span
                  className={`inline-flex size-6 shrink-0 items-center justify-center rounded-full border ${
                    isSelected ? 'border-brand-700 bg-brand-700 text-white' : 'border-line text-subtle'
                  }`}
                  aria-hidden
                >
                  {isSelected ? <Check className="size-3.5" strokeWidth={3} /> : <Plus className="size-3.5" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={`block truncate text-sm ${isSelected ? 'font-bold' : 'font-medium'}`}>{e.name}</span>
                  <span className="block text-xs text-subtle">
                    {[e.town, e.travel ? `~${e.travel.minutes} min` : null].filter(Boolean).join(' · ')}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <Button className="mt-2 w-full" onClick={onDone}>
        Done
      </Button>
    </section>
  );
}
