import { activeFilterCount, DEFAULT_PLANNER_FILTERS, PLANNER_FILTER_OPTIONS, type PlannerFilters } from '@runsaturday/shared';
import { ChevronDown, RotateCcw, SlidersHorizontal } from 'lucide-react';
import { useId, useState } from 'react';
import { Button } from './Button';
import { ChoiceChips } from './ChoiceChips';

type FilterKey = keyof PlannerFilters;

const DEFAULT_LABELS: Record<FilterKey, string> = {
  surface: 'Surface',
  elevation: 'Elevation',
  participants: 'Average runners',
  visited: 'Visited',
  course: 'Course type',
  confidence: 'Minimum confidence',
};

interface FilterPanelProps<K extends FilterKey> {
  keys: readonly K[];
  filters: Pick<PlannerFilters, K>;
  onChange: (key: K, value: string) => void;
  onReset: () => void;
  labels?: Partial<Record<K, string>>;
  title?: string;
}

/** Collapsible filter groups built from the shared filter options. */
export function FilterPanel<K extends FilterKey>({ keys, filters, onChange, onReset, labels, title = 'Advanced filters' }: FilterPanelProps<K>) {
  const count = activeFilterCount({ ...DEFAULT_PLANNER_FILTERS, ...filters });
  const [open, setOpen] = useState(() => count > 0);
  const panelId = useId();
  const label = (key: K) => labels?.[key] ?? DEFAULT_LABELS[key];

  return (
    <div className="pt-4">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((v) => !v)}
          className="-ml-1 inline-flex min-h-11 items-center gap-2 rounded-full px-1 text-sm font-bold whitespace-nowrap"
        >
          <SlidersHorizontal className="size-4" aria-hidden />
          {title}
          {count > 0 && (
            <span className="rounded-full bg-ink px-2 py-0.5 text-xs text-white">
              {count}
              <span className="sr-only"> active</span>
            </span>
          )}
          <ChevronDown className={`size-4 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
        </button>
        {count > 0 && (
          <Button variant="ghost" className="min-h-9 px-2 whitespace-nowrap" onClick={onReset}>
            <RotateCcw className="size-4" aria-hidden />
            Reset filters
          </Button>
        )}
      </div>
      <div id={panelId} hidden={!open} className="mt-2 space-y-4">
        {keys.map((key) => (
          <div key={key}>
            <p className="mb-2 text-xs font-semibold text-muted">{label(key)}</p>
            <ChoiceChips
              label={label(key)}
              options={PLANNER_FILTER_OPTIONS[key].map((o) => ({ value: o.id, label: o.label }))}
              value={filters[key]}
              onChange={(v) => onChange(key, v)}
            />
          </div>
        ))}
        <p className="text-xs text-subtle">Events with unknown values are left out when a filter is active.</p>
      </div>
    </div>
  );
}
