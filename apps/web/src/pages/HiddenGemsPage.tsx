import { formatFinishTime, HIDDEN_GEM_MODES, TRAVEL_LIMIT_OPTIONS, type HiddenGemModeId } from '@runsaturday/shared';
import { Gem, Info } from 'lucide-react';
import { useSearchParams } from 'react-router';
import { GemCard } from '../components/performance/GemCard';
import { ChoiceChips } from '../components/ui/ChoiceChips';
import { EmptyState } from '../components/ui/EmptyState';
import { ErrorState } from '../components/ui/ErrorState';
import { LoadingState } from '../components/ui/LoadingState';
import { PageHeader } from '../components/ui/PageHeader';
import { useHiddenGems } from '../hooks/queries';

export function HiddenGemsPage() {
  const [params, setParams] = useSearchParams();
  const modeParam = params.get('mode');
  const mode = (HIDDEN_GEM_MODES.some((m) => m.id === modeParam) ? modeParam : 'all') as HiddenGemModeId;
  const travelRaw = Number(params.get('travel'));
  const maxTravel = (TRAVEL_LIMIT_OPTIONS as readonly number[]).includes(travelRaw) ? travelRaw : undefined;
  const { data, isPending, isError, error, refetch, isPlaceholderData } = useHiddenGems({ mode, maxTravel });

  const update = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value == null) next.delete(key);
    else next.set(key, value);
    setParams(next, { replace: true, preventScrollReset: true });
  };
  const modeDef = HIDDEN_GEM_MODES.find((m) => m.id === mode)!;

  return (
    <div className="space-y-6">
      <PageHeader back title="Hidden Gems" subtitle="Discover smaller events that are easy to overlook." />

      <section aria-label="Hidden Gems settings" className="space-y-4 rounded-3xl border border-line bg-surface p-4">
        <div>
          <p className="mb-2 text-sm font-bold">Mode</p>
          <ChoiceChips label="Mode" options={HIDDEN_GEM_MODES.map((m) => ({ value: m.id, label: m.label }))} value={mode} onChange={(m) => update('mode', m === 'all' ? null : m)} />
          <p className="mt-2 text-xs text-muted">{modeDef.description}</p>
        </div>
        <div>
          <p className="mb-2 flex items-baseline justify-between text-sm font-bold">
            Travel limit <span className="text-xs font-normal text-subtle">Estimated travel</span>
          </p>
          <ChoiceChips
            label="Maximum estimated travel"
            scroll
            options={TRAVEL_LIMIT_OPTIONS.map((m) => ({ value: m, label: `${m} min` }))}
            value={maxTravel ?? data?.maxTravelMinutes}
            onChange={(m) => update('travel', String(m))}
          />
        </div>
      </section>

      <section aria-labelledby="gem-results" className="space-y-3">
        <h2 id="gem-results" className="sr-only">
          Hidden Gems
        </h2>
        {isPending ? (
          <LoadingState variant="card" label="Finding hidden gems" />
        ) : isError ? (
          <ErrorState error={error} title="Hidden Gems could not load" onRetry={() => refetch()} />
        ) : data.results.length === 0 ? (
          <EmptyState icon={Gem} title="No gems in this mode" description={data.message ?? 'Try another mode or a longer travel limit.'} />
        ) : (
          <div className={isPlaceholderData ? 'space-y-3 opacity-60 transition-opacity' : 'space-y-3 transition-opacity'} aria-busy={isPlaceholderData}>
            <p className="text-sm text-muted" aria-live="polite">
              <strong className="font-bold text-ink">
                {data.results.length} {data.results.length === 1 ? 'gem' : 'gems'}
              </strong>{' '}
              within {data.maxTravelMinutes} min
              {data.timeSeconds != null && <> · placement based on your current form ({formatFinishTime(data.timeSeconds)})</>}
            </p>
            <ol className="space-y-3">
              {data.results.map((g) => (
                <li key={g.event.id}>
                  <GemCard gem={g} />
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
