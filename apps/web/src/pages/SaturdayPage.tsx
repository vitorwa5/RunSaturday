import {
  activeFilterCount,
  DEFAULT_PLANNER_FILTERS,
  formatShortDate,
  goalDefinition,
  PLANNER_FILTER_OPTIONS,
  TRAVEL_LIMIT_OPTIONS,
  type Goal,
  type PlannerFilters,
  type PlannerResponse,
} from '@runsaturday/shared';
import { ChevronDown, ChevronRight, Columns3, Flag, Gem, Home, Info, Medal, RotateCcw, SearchX, SlidersHorizontal, Timer, type LucideIcon } from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router';
import { RecommendationCard } from '../components/events/RecommendationCard';
import { GoalSelector } from '../components/goals/GoalSelector';
import { Button } from '../components/ui/Button';
import { ChoiceChips } from '../components/ui/ChoiceChips';
import { EmptyState } from '../components/ui/EmptyState';
import { ErrorState } from '../components/ui/ErrorState';
import { LoadingState } from '../components/ui/LoadingState';
import { PageHeader, SectionHeading } from '../components/ui/PageHeader';
import { usePlanner } from '../hooks/queries';
import { parsePlannerParams, serializePlannerParams, type PlannerSelection } from '../lib/plannerParams';
import { plannerSaturdays } from '../lib/saturday';

const FILTER_LABELS: Record<keyof PlannerFilters, string> = {
  surface: 'Surface',
  elevation: 'Elevation',
  participants: 'Average runners',
  visited: 'Visited',
  course: 'Course type',
  confidence: 'Minimum confidence',
};

const TOOLS: { to: string; title: string; icon: LucideIcon }[] = [
  { to: '/pb-finder', title: 'PB Finder', icon: Timer },
  { to: '/where-could-i-place', title: 'Where Could I Place?', icon: Medal },
  { to: '/hidden-gems', title: 'Hidden Gems', icon: Gem },
  { to: '/compare', title: 'Compare events', icon: Columns3 },
];

function Step({ number, title, children, aside }: { number: number; title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="py-4 first:pt-0 last:pb-0">
      <div className="mb-2.5 flex items-baseline justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-bold">
          <span className="inline-flex size-5 items-center justify-center rounded-full bg-ink text-[11px] text-white" aria-hidden>
            {number}
          </span>
          {title}
        </h2>
        {aside}
      </div>
      {children}
    </div>
  );
}

function FiltersPanel({
  filters,
  onChange,
  onReset,
}: {
  filters: PlannerFilters;
  onChange: (key: keyof PlannerFilters, value: string) => void;
  onReset: () => void;
}) {
  const [open, setOpen] = useState(() => activeFilterCount(filters) > 0);
  const panelId = useId();
  const count = activeFilterCount(filters);

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
          Advanced filters
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
        {(Object.keys(FILTER_LABELS) as (keyof PlannerFilters)[]).map((key) => (
          <div key={key}>
            <p className="mb-2 text-xs font-semibold text-muted">{FILTER_LABELS[key]}</p>
            <ChoiceChips
              label={FILTER_LABELS[key]}
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

function Results({
  data,
  isPlaceholderData,
  goal,
  onResetFilters,
}: {
  data: PlannerResponse;
  isPlaceholderData: boolean;
  goal: Goal;
  onResetFilters: () => void;
}) {
  const isDemo = data.results.some((r) => r.event.source === 'demo');

  if (data.results.length === 0) {
    const filtersBlocking = activeFilterCount(data.filters) > 0 && data.counts.withinTravel > 0 && data.counts.matchingFilters === 0;
    const unavailable = !goalDefinition(goal).available;
    return (
      <EmptyState
        icon={unavailable ? Flag : SearchX}
        title={filtersBlocking ? 'No events match these filters.' : unavailable ? `${goalDefinition(goal).longLabel} isn't available yet` : 'No events to show'}
        description={filtersBlocking ? 'Try removing a filter or increasing your travel limit.' : (data.message ?? 'Try changing your plan.')}
        action={
          filtersBlocking ? (
            <Button onClick={onResetFilters}>
              <RotateCcw className="size-4" aria-hidden />
              Reset filters
            </Button>
          ) : undefined
        }
      />
    );
  }

  const rankedByLabel = data.results[0]!.rankedBy.label;
  return (
    <div className={isPlaceholderData ? 'opacity-60 transition-opacity' : 'transition-opacity'} aria-busy={isPlaceholderData}>
      <p className="text-sm text-muted" aria-live="polite">
        <strong className="font-bold text-ink">
          {data.results.length} {data.results.length === 1 ? 'event' : 'events'}
        </strong>{' '}
        within {data.maxTravelMinutes} min · ranked by {rankedByLabel.toLowerCase()}
      </p>
      <p className="mt-0.5 text-xs text-subtle">
        {isDemo ? 'Demo recommendation' : 'Recommendation'} · {data.method}
      </p>
      <ol className="mt-3 space-y-3">
        {data.results.map((r) => (
          <li key={r.event.id}>
            <RecommendationCard recommendation={r} />
          </li>
        ))}
      </ol>
    </div>
  );
}

export function SaturdayPage() {
  const [params, setParams] = useSearchParams();
  const selection = parsePlannerParams(params);
  const { data, isPending, isError, error, refetch, isPlaceholderData } = usePlanner(selection);

  const update = (patch: Partial<PlannerSelection>) =>
    setParams(serializePlannerParams({ ...selection, ...patch }), { replace: true, preventScrollReset: true });
  const resetFilters = () => update({ filters: DEFAULT_PLANNER_FILTERS });

  // Server-resolved defaults (profile travel limit, preferred goal) fill unset selections.
  const dates = data?.availableDates ?? plannerSaturdays();
  const date = selection.date ?? data?.date ?? dates[0];
  const goal = selection.goal ?? data?.goal ?? 'pb';
  const maxTravel = selection.maxTravel ?? data?.maxTravelMinutes;

  return (
    <div className="space-y-6">
      <PageHeader title="Plan My Saturday" subtitle="Choose your goal and limits. We'll rank the events for you." />

      <section aria-label="Your plan" className="divide-y divide-line rounded-3xl border border-line bg-surface p-4">
        <Step number={1} title="Date">
          <ChoiceChips
            label="Date"
            scroll
            options={dates.map((d, i) => ({ value: d, label: `${i === 0 ? 'This Sat' : 'Sat'} ${formatShortDate(d)}` }))}
            value={date}
            onChange={(d) => update({ date: d })}
          />
        </Step>

        <Step number={2} title="Starting point">
          <p className="mb-2.5 flex items-center gap-1.5 text-sm">
            <Home className="size-4 text-subtle" aria-hidden />
            <span className="text-muted">Starting from</span>
            <strong className="font-semibold">{data?.origin?.label ?? 'Home'}</strong>
          </p>
          <ChoiceChips
            label="Starting point"
            scroll
            options={[
              { value: 'home', label: 'Home' },
              { value: 'current', label: 'Current location', disabled: true, hint: 'Later' },
              { value: 'manual', label: 'Enter location', disabled: true, hint: 'Later' },
            ]}
            value="home"
            onChange={() => undefined}
          />
        </Step>

        <Step number={3} title="Travel limit" aside={<span className="text-xs text-subtle">Estimated travel</span>}>
          <ChoiceChips
            label="Maximum estimated travel"
            scroll
            options={TRAVEL_LIMIT_OPTIONS.map((m) => ({ value: m, label: `${m} min` }))}
            value={maxTravel}
            onChange={(m) => update({ maxTravel: m })}
          />
        </Step>

        <Step number={4} title="Goal">
          <GoalSelector value={goal} onChange={(g) => update({ goal: g })} labels="long" label="Goal" />
        </Step>

        <FiltersPanel filters={selection.filters} onChange={(key, value) => update({ filters: { ...selection.filters, [key]: value } })} onReset={resetFilters} />
      </section>

      <section aria-labelledby="results-heading">
        <SectionHeading>
          <span id="results-heading">Your Saturday options</span>
        </SectionHeading>
        {isPending ? (
          <LoadingState variant="card" label="Ranking events" />
        ) : isError ? (
          <ErrorState error={error} title="Your plan could not be calculated" onRetry={() => refetch()} />
        ) : (
          <Results data={data} isPlaceholderData={isPlaceholderData} goal={goal} onResetFilters={resetFilters} />
        )}
        {data && (
          <ul className="mt-4 space-y-1">
            {data.notes.map((note) => (
              <li key={note} className="flex items-start gap-1.5 text-xs text-subtle">
                <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                {note}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="tools">
        <SectionHeading>
          <span id="tools">More Saturday tools</span>
        </SectionHeading>
        <ul className="grid grid-cols-2 gap-2">
          {TOOLS.map(({ to, title, icon: Icon }) => (
            <li key={to}>
              <Link to={to} className="flex min-h-14 items-center gap-2 rounded-2xl border border-line bg-surface p-3 text-sm font-semibold hover:bg-zinc-50">
                <Icon className="size-4 shrink-0 text-brand-700" aria-hidden />
                <span className="min-w-0 flex-1">{title}</span>
                <ChevronRight className="size-4 shrink-0 text-subtle" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
