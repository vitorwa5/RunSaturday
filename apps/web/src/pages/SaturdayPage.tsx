import {
  activeFilterCount,
  DEFAULT_PLANNER_FILTERS,
  formatShortDate,
  goalDefinition,
  PLANNER_FILTER_KEYS,
  TRAVEL_LIMIT_OPTIONS,
  type Goal,
  type PlannerResponse,
} from '@runsaturday/shared';
import { Columns3, Flag, Home, Info, RotateCcw, SearchX } from 'lucide-react';
import type { ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import { RecommendationCard } from '../components/events/RecommendationCard';
import { ToolLinks } from '../components/navigation/ToolLinks';
import { FilterPanel } from '../components/ui/FilterPanel';
import { GoalSelector } from '../components/goals/GoalSelector';
import { Button, ButtonLink } from '../components/ui/Button';
import { ChoiceChips } from '../components/ui/ChoiceChips';
import { EmptyState } from '../components/ui/EmptyState';
import { ErrorState } from '../components/ui/ErrorState';
import { LoadingState } from '../components/ui/LoadingState';
import { PageHeader, SectionHeading } from '../components/ui/PageHeader';
import { usePlanner } from '../hooks/queries';
import { parsePlannerParams, serializePlannerParams, type PlannerSelection } from '../lib/plannerParams';
import { plannerSaturdays } from '../lib/saturday';

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
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted" aria-live="polite">
            <strong className="font-bold text-ink">
              {data.results.length} {data.results.length === 1 ? 'event' : 'events'}
            </strong>{' '}
            within {data.maxTravelMinutes} min · ranked by {rankedByLabel.toLowerCase().replace(/\bpb\b/g, 'PB')}
          </p>
          <p className="mt-0.5 text-xs text-subtle">
            {isDemo ? 'Demo recommendation' : 'Recommendation'} · {data.method}
          </p>
        </div>
        {data.results.length >= 2 && (
          <ButtonLink
            to={`/compare?ids=${data.results.slice(0, 3).map((r) => r.event.id).join(',')}`}
            variant="ghost"
            className="min-h-9 shrink-0 px-2"
          >
            <Columns3 className="size-4" aria-hidden />
            Compare top {Math.min(3, data.results.length)}
          </ButtonLink>
        )}
      </div>
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

        <FilterPanel
          keys={PLANNER_FILTER_KEYS}
          filters={selection.filters}
          onChange={(key, value) => update({ filters: { ...selection.filters, [key]: value } })}
          onReset={resetFilters}
        />
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
        <ToolLinks />
      </section>
    </div>
  );
}
