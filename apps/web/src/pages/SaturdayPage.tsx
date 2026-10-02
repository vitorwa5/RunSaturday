import { activeFilterCount, DEFAULT_PLANNER_FILTERS, GOALS, type Goal, formatShortDate, PLANNER_FILTER_KEYS, TRAVEL_LIMIT_OPTIONS, type SaturdayRecommendationsResponse } from '@runsaturday/shared';
import { Columns3, Home, Info, RefreshCw, RotateCcw, SearchX } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router';
import { BestPickCard } from '../components/events/BestPickCard';
import { RecommendationCard, type SecondaryMetric } from '../components/events/RecommendationCard';
import { IntentSelector } from '../components/goals/IntentSelector';
import { ToolLinks } from '../components/navigation/ToolLinks';
import { ChallengePicker } from '../components/saturday/ChallengePicker';
import { SaturdayNotes } from '../components/saturday/SaturdayNotes';
import { Button, ButtonLink } from '../components/ui/Button';
import { ChoiceChips } from '../components/ui/ChoiceChips';
import { EmptyState } from '../components/ui/EmptyState';
import { ErrorState } from '../components/ui/ErrorState';
import { FilterPanel } from '../components/ui/FilterPanel';
import { LoadingState } from '../components/ui/LoadingState';
import { PageHeader, SectionHeading } from '../components/ui/PageHeader';
import { useSaturday } from '../hooks/queries';
import { parsePlannerParams, serializePlannerParams, withIntent, type PlannerSelection } from '../lib/plannerParams';
import { plannerSaturdays } from '../lib/saturday';

/** Explore intents lead with course character, not performance metrics (those stay on the event page). */
const EXPLORE_INTENTS: ReadonlySet<Goal> = new Set(GOALS.filter((g) => g.pillar === 'explore').map((g) => g.id));
const EXPLORE_SECONDARY: SecondaryMetric[] = ['surface', 'elevation', 'average_participants'];

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
  onResetFilters,
  onAnother,
}: {
  data: SaturdayRecommendationsResponse;
  isPlaceholderData: boolean;
  onResetFilters: () => void;
  onAnother: () => void;
}) {
  if (!data.bestPick) {
    const filtersBlocking = activeFilterCount(data.filters) > 0 && data.counts.withinTravel > 0 && (data.counts.matchingFilters === 0 || data.defaultsApplied.length > 0);
    return (
      <div className="space-y-3">
        <EmptyState
          icon={SearchX}
          title={data.counts.matchingFilters === 0 && filtersBlocking ? 'No events match these filters.' : 'No events to show'}
          description={data.message ?? 'Try changing your plan.'}
          action={
            filtersBlocking ? (
              <Button onClick={onResetFilters}>
                <RotateCcw className="size-4" aria-hidden />
                Reset filters
              </Button>
            ) : undefined
          }
        />
        <SaturdayNotes data={data} />
      </div>
    );
  }

  const others = data.results.slice(1);
  return (
    <div className={isPlaceholderData ? 'space-y-4 opacity-60 transition-opacity' : 'space-y-4 transition-opacity'} aria-busy={isPlaceholderData}>
      <p className="text-sm text-muted" aria-live="polite">
        <strong className="font-bold text-ink">
          {data.results.length} {data.results.length === 1 ? 'event' : 'events'}
        </strong>{' '}
        within {data.maxTravelMinutes} min
      </p>
      <BestPickCard recommendation={data.bestPick} method={data.method} />
      {data.intent === 'surprise' && data.surprise && data.surprise.shortlist > 1 && (
        <Button variant="secondary" className="w-full" onClick={onAnother}>
          <RefreshCw className="size-4" aria-hidden />
          Show me another
        </Button>
      )}
      <SaturdayNotes data={data} />
      {others.length > 0 && (
        <section aria-labelledby="other-good-options">
          <SectionHeading
            action={
              <ButtonLink to={`/compare?ids=${data.results.slice(0, 3).map((r) => r.event.id).join(',')}`} variant="ghost" className="min-h-9 shrink-0 px-2">
                <Columns3 className="size-4" aria-hidden />
                Compare top {Math.min(3, data.results.length)}
              </ButtonLink>
            }
          >
            <span id="other-good-options">Other good options</span>
          </SectionHeading>
          <ol className="space-y-3">
            {others.map((r) => (
              <li key={r.event.id}>
                <RecommendationCard recommendation={r} secondary={EXPLORE_INTENTS.has(data.intent) ? EXPLORE_SECONDARY : undefined} />
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}

export function SaturdayPage() {
  const [params, setParams] = useSearchParams();
  const selection = parsePlannerParams(params);
  const { data, isPending, isError, error, refetch, isPlaceholderData } = useSaturday(selection);

  const set = (next: PlannerSelection) => setParams(serializePlannerParams(next), { replace: true, preventScrollReset: true });
  const update = (patch: Partial<PlannerSelection>) => set({ ...selection, ...patch });
  const resetFilters = () => update({ filters: DEFAULT_PLANNER_FILTERS });

  // Server-resolved defaults (profile travel limit, preferred intent) fill unset selections.
  const dates = data?.availableDates ?? plannerSaturdays();
  const date = selection.date ?? data?.date ?? dates[0];
  const intent = selection.intent ?? data?.intent ?? 'pb';
  const maxTravel = selection.maxTravel ?? data?.maxTravelMinutes;

  return (
    <div className="space-y-6">
      <PageHeader title="Plan My Saturday" subtitle="Say what you're looking for. Your limits and filters stay as you switch." />

      <section aria-label="Your plan" className="divide-y divide-line rounded-3xl border border-line bg-surface p-4">
        <Step number={1} title="What are you looking for?">
          <IntentSelector
            value={intent}
            // Switching keeps travel, date and filters; only intent-specific state is dropped.
            onChange={(i) => set(withIntent({ ...selection, ...(maxTravel != null ? { maxTravel } : {}) }, i))}
            label="What are you looking for?"
          />
          {intent === 'challenge' && data?.challenge && (
            <div className="mt-3">
              <ChallengePicker context={data.challenge} onChange={(c) => set({ ...selection, intent, challenge: c.challenge, item: c.item })} />
            </div>
          )}
        </Step>

        <Step number={2} title="Date">
          <ChoiceChips
            label="Date"
            scroll
            options={dates.map((d, i) => ({ value: d, label: `${i === 0 ? 'This Sat' : 'Sat'} ${formatShortDate(d)}` }))}
            value={date}
            onChange={(d) => update({ date: d })}
          />
        </Step>

        <Step number={3} title="Starting point">
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

        <Step number={4} title="Travel limit" aside={<span className="text-xs text-subtle">Estimated travel</span>}>
          <ChoiceChips
            label="Maximum estimated travel"
            scroll
            options={TRAVEL_LIMIT_OPTIONS.map((m) => ({ value: m, label: `${m} min` }))}
            value={maxTravel}
            onChange={(m) => update({ maxTravel: m })}
          />
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
        {data && (
          <p className="mb-3 rounded-2xl border border-line bg-surface px-3 py-2 text-xs text-muted" role="note" aria-label="Your ability reference">
            {data.ability.note}{' '}
            <Link to="/profile/current-form" className="font-semibold text-brand-700">
              About Current Form
            </Link>
          </p>
        )}
        {isPending ? (
          <LoadingState variant="card" label="Ranking events" />
        ) : isError ? (
          <ErrorState error={error} title="Your plan could not be calculated" onRetry={() => refetch()} />
        ) : (
          <Results
            data={data}
            isPlaceholderData={isPlaceholderData}
            onResetFilters={resetFilters}
            onAnother={() => update({ intent, offset: (data.surprise?.offset ?? 0) + 1 })}
          />
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
