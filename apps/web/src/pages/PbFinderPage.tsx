import {
  CONFIDENCE_FILTERS,
  ELEVATION_FILTERS,
  PB_FINDER_SORTS,
  SURFACE_FILTERS,
  TRAVEL_LIMIT_OPTIONS,
  VISITED_FILTERS,
  type PbFinderSortId,
  type PlannerFilters,
} from '@runsaturday/shared';
import { Columns3, Info, RotateCcw, SearchX } from 'lucide-react';
import { useSearchParams } from 'react-router';
import { RecommendationCard } from '../components/events/RecommendationCard';
import { Button, ButtonLink } from '../components/ui/Button';
import { ChoiceChips } from '../components/ui/ChoiceChips';
import { EmptyState } from '../components/ui/EmptyState';
import { ErrorState } from '../components/ui/ErrorState';
import { FilterPanel } from '../components/ui/FilterPanel';
import { LoadingState } from '../components/ui/LoadingState';
import { PageHeader } from '../components/ui/PageHeader';
import { usePbFinder } from '../hooks/queries';

type PbFilterKey = 'surface' | 'elevation' | 'confidence' | 'visited';
const FILTER_KEYS: readonly PbFilterKey[] = ['surface', 'elevation', 'confidence', 'visited'];
const OPTIONS = { surface: SURFACE_FILTERS, elevation: ELEVATION_FILTERS, confidence: CONFIDENCE_FILTERS, visited: VISITED_FILTERS };

const oneOf = <T extends string>(value: string | null, ids: readonly T[], fallback: T): T =>
  value != null && (ids as readonly string[]).includes(value) ? (value as T) : fallback;

export function PbFinderPage() {
  const [params, setParams] = useSearchParams();
  const sort = oneOf<PbFinderSortId>(params.get('sort'), PB_FINDER_SORTS.map((s) => s.id), 'pb');
  const travelRaw = Number(params.get('travel'));
  const maxTravel = (TRAVEL_LIMIT_OPTIONS as readonly number[]).includes(travelRaw) ? travelRaw : undefined;
  const filters = Object.fromEntries(
    FILTER_KEYS.map((k) => [k, oneOf(params.get(k), OPTIONS[k].map((o) => o.id), 'any')]),
  ) as Pick<PlannerFilters, PbFilterKey>;

  const { data, isPending, isError, error, refetch, isPlaceholderData } = usePbFinder({ maxTravel, sort, ...filters });

  const update = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v == null || v === 'any') next.delete(k);
      else next.set(k, v);
    }
    setParams(next, { replace: true, preventScrollReset: true });
  };
  const resetFilters = () => update(Object.fromEntries(FILTER_KEYS.map((k) => [k, null])));
  const sortLabel = PB_FINDER_SORTS.find((s) => s.id === sort)!.label;

  return (
    <div className="space-y-6">
      <PageHeader back title="PB Finder" subtitle="Find the events with the strongest conditions for a fast 5K." />

      <section aria-label="PB Finder settings" className="rounded-3xl border border-line bg-surface p-4">
        <div className="space-y-4">
          <div>
            <p className="mb-2 flex items-baseline justify-between text-sm font-bold">
              Travel limit <span className="text-xs font-normal text-subtle">Estimated travel</span>
            </p>
            <ChoiceChips
              label="Maximum estimated travel"
              scroll
              options={TRAVEL_LIMIT_OPTIONS.map((m) => ({ value: m, label: `${m} min` }))}
              value={maxTravel ?? data?.maxTravelMinutes}
              onChange={(m) => update({ travel: String(m) })}
            />
          </div>
          <div>
            <p className="mb-2 text-sm font-bold">Sort by</p>
            <ChoiceChips label="Sort by" scroll options={PB_FINDER_SORTS.map((s) => ({ value: s.id, label: s.label }))} value={sort} onChange={(s) => update({ sort: s === 'pb' ? null : s })} />
          </div>
        </div>
        <FilterPanel
          title="Filters"
          keys={FILTER_KEYS}
          filters={filters}
          labels={{ elevation: 'Maximum elevation' }}
          onChange={(k, v) => update({ [k]: v })}
          onReset={resetFilters}
        />
      </section>

      <section aria-labelledby="pb-results" className="space-y-3">
        <h2 id="pb-results" className="sr-only">
          PB Finder results
        </h2>
        {isPending ? (
          <LoadingState variant="card" label="Finding fast courses" />
        ) : isError ? (
          <ErrorState error={error} title="PB Finder could not load" onRetry={() => refetch()} />
        ) : data.results.length === 0 ? (
          <EmptyState
            icon={SearchX}
            title={data.message ?? 'No events found'}
            description="Try removing a filter or increasing your travel limit."
            action={
              data.counts.matching === 0 && data.counts.withinTravel > 0 ? (
                <Button onClick={resetFilters}>
                  <RotateCcw className="size-4" aria-hidden />
                  Reset filters
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className={isPlaceholderData ? 'space-y-3 opacity-60 transition-opacity' : 'space-y-3 transition-opacity'} aria-busy={isPlaceholderData}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm text-muted" aria-live="polite">
                  <strong className="font-bold text-ink">
                    {data.results.length} {data.results.length === 1 ? 'event' : 'events'}
                  </strong>{' '}
                  within {data.maxTravelMinutes} min · sorted by {sortLabel.toLowerCase().replace(/\bpb\b/g, 'PB')}
                </p>
                <p className="mt-0.5 text-xs text-subtle">Using demo PB Scores</p>
              </div>
              {data.results.length >= 2 && (
                <ButtonLink to={`/compare?ids=${data.results.slice(0, 3).map((r) => r.event.id).join(',')}`} variant="ghost" className="min-h-9 shrink-0 px-2">
                  <Columns3 className="size-4" aria-hidden />
                  Compare
                </ButtonLink>
              )}
            </div>
            <ol className="space-y-3">
              {data.results.map((r) => (
                <li key={r.event.id}>
                  <RecommendationCard
                    recommendation={r}
                    metricLabel={r.event.source === 'demo' ? 'Demo PB Score' : 'PB Score'}
                    secondary={['difficulty', 'elevation', 'surface']}
                  />
                </li>
              ))}
            </ol>
            <ul className="space-y-1">
              {data.notes.map((note) => (
                <li key={note} className="flex items-start gap-1.5 text-xs text-subtle">
                  <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                  {note}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}
