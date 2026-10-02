import {
  DEFAULT_HISTORY_WINDOW,
  DEFAULT_PLACEMENT_TARGET,
  formatFinishTime,
  HISTORY_WINDOWS,
  PLACEMENT_TARGETS,
  RUNNER_TIME_SOURCES,
  TRAVEL_LIMIT_OPTIONS,
  type HistoryWindowId,
  type PlacementMode,
  type PlacementTargetId,
  type RunnerTimeSourceId,
} from '@runsaturday/shared';
import { Columns3, Info, Medal, SearchX } from 'lucide-react';
import { useId } from 'react';
import type { ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import { PlacementCard } from '../components/performance/PlacementCard';
import { RunnerTimePicker } from '../components/performance/RunnerTimePicker';
import { AlertBanner } from '../components/ui/AlertBanner';
import { ButtonLink } from '../components/ui/Button';
import { ChoiceChips } from '../components/ui/ChoiceChips';
import { EmptyState } from '../components/ui/EmptyState';
import { ErrorState } from '../components/ui/ErrorState';
import { LoadingState } from '../components/ui/LoadingState';
import { PageHeader } from '../components/ui/PageHeader';
import { useEvents, usePlacement, useProfile } from '../hooks/queries';
import { LIMITED_MATCHED } from '../lib/display';
import { profileSourceEvent, resolveRunnerTime } from '../lib/runnerTime';

const MODE_HELP: Record<PlacementMode, string> = {
  adjusted:
    'Your time is converted to an equivalent at each course using Course Speed Factors from runners who ran at both, then compared with past results. Equivalents are historical conversions, not predicted finish times.',
  raw: 'The exact same time is compared with past results at every event, whatever the course.',
};

const RELIABLE = new Set(['high', 'medium']);

const oneOf = <T extends string>(value: string | null, ids: readonly T[], fallback: T): T =>
  value != null && (ids as readonly string[]).includes(value) ? (value as T) : fallback;

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-sm font-bold">{label}</p>
      {children}
    </div>
  );
}

export function WhereCouldIPlacePage() {
  const [params, setParams] = useSearchParams();
  const { data: profile } = useProfile();

  const source = oneOf<RunnerTimeSourceId>(params.get('src'), RUNNER_TIME_SOURCES.map((s) => s.id), 'current');
  const manualRaw = Number(params.get('time'));
  const manualSeconds = Number.isInteger(manualRaw) && manualRaw > 0 ? manualRaw : null;
  const target = oneOf<PlacementTargetId>(params.get('target'), PLACEMENT_TARGETS.map((t) => t.id), DEFAULT_PLACEMENT_TARGET);
  const window = oneOf<HistoryWindowId>(params.get('window'), HISTORY_WINDOWS.map((w) => w.id), DEFAULT_HISTORY_WINDOW);
  const travelRaw = Number(params.get('travel'));
  const maxTravel = (TRAVEL_LIMIT_OPTIONS as readonly number[]).includes(travelRaw) ? travelRaw : undefined;

  const timeSeconds = resolveRunnerTime(source, profile, manualSeconds);

  // Where the time was achieved: the preset's own event, unless the runner picked another ("none" = not specified).
  const { data: events } = useEvents();
  const fromParam = params.get('from');
  const achievedAt = fromParam === 'none' ? null : (fromParam ?? profileSourceEvent(source, profile)?.id ?? null);
  const achievedEvent = events?.find((e) => e.id === achievedAt) ?? null;
  const adjustable = achievedEvent != null && achievedEvent.scores?.courseSpeedFactor != null && RELIABLE.has(achievedEvent.scores.courseSpeedConfidence);
  const modeParam = params.get('mode');
  // Course adjusted by default whenever a reliable source event is known.
  const mode: PlacementMode = modeParam === 'raw' || achievedAt == null ? 'raw' : modeParam === 'adjusted' || adjustable ? 'adjusted' : 'raw';
  const adjustedUnavailable =
    achievedAt == null
      ? 'Choose where the time was achieved to adjust it for each course.'
      : events && !adjustable
        ? `Course adjustment unavailable at ${achievedEvent?.name ?? 'this event'} — ${LIMITED_MATCHED.toLowerCase()}.`
        : null;
  const achievedId = useId();

  // Wait for the event list before choosing the default mode, so results do not flip from raw to adjusted.
  const modeKnown = achievedAt == null || events != null || modeParam != null;
  const { data, isPending, isError, error, refetch, isPlaceholderData, fetchStatus } = usePlacement({
    timeSeconds: modeKnown ? timeSeconds : null,
    window,
    target,
    maxTravel,
    mode,
    source: achievedAt ?? undefined,
  });

  const update = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v == null) next.delete(k);
      else next.set(k, v);
    }
    setParams(next, { replace: true, preventScrollReset: true });
  };

  const travelValue = maxTravel ?? data?.maxTravelMinutes ?? undefined;
  const windowLabel = window === 'all' ? 'all stored history' : window === '365' ? 'the last year' : `the last ${window} days`;
  // Waiting for input only once the profile has loaded (or the runner chose to type a time).
  const awaitingTime = timeSeconds == null && fetchStatus === 'idle' && (source === 'manual' || profile != null);

  return (
    <div className="space-y-6">
      <PageHeader back title="Where Could I Place?" subtitle="See where your 5K time would historically have placed at nearby events." />

      <section aria-label="Your time and settings" className="space-y-5 rounded-3xl border border-line bg-surface p-4">
        <Field label="Your 5K time">
          <RunnerTimePicker
            profile={profile}
            source={source}
            manualSeconds={manualSeconds}
            onSourceChange={(s) => update({ src: s, from: null, ...(s !== 'manual' ? { time: null } : {}) })}
            onManualSubmit={(seconds) => update({ src: 'manual', time: String(seconds) })}
          />
          <div className="mt-3">
            <label htmlFor={achievedId} className="mb-1.5 block text-sm font-semibold">
              Achieved at
            </label>
            <select
              id={achievedId}
              value={achievedAt ?? 'none'}
              onChange={(e) => update({ from: e.target.value, mode: null })}
              className="min-h-11 w-full rounded-full border border-line bg-surface px-4 text-base focus:border-brand-700 focus:outline-none"
            >
              <option value="none">Not specified</option>
              {events?.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          </div>
        </Field>
        <Field label="Compare as">
          <ChoiceChips
            label="Compare as"
            options={[
              { value: 'adjusted' as const, label: 'Course adjusted', disabled: adjustedUnavailable != null && mode !== 'adjusted' },
              { value: 'raw' as const, label: 'Raw time' },
            ]}
            value={mode}
            onChange={(m) => update({ mode: m })}
          />
          <p className="mt-2 text-xs text-muted">{MODE_HELP[mode]}</p>
          {mode === 'raw' && adjustedUnavailable && <p className="mt-1 text-xs text-subtle">{adjustedUnavailable}</p>}
        </Field>
        <Field label="Target">
          <ChoiceChips label="Target" scroll options={PLACEMENT_TARGETS.map((t) => ({ value: t.id, label: t.label }))} value={target} onChange={(t) => update({ target: t })} />
        </Field>
        <Field label="Period">
          <ChoiceChips label="Period" options={HISTORY_WINDOWS.map((w) => ({ value: w.id, label: w.label }))} value={window} onChange={(w) => update({ window: w })} />
        </Field>
        <Field label="Estimated travel">
          <ChoiceChips
            label="Maximum estimated travel"
            scroll
            options={TRAVEL_LIMIT_OPTIONS.map((m) => ({ value: m, label: `${m} min` }))}
            value={travelValue}
            onChange={(m) => update({ travel: String(m) })}
          />
        </Field>
      </section>

      <section aria-labelledby="placement-results" className="space-y-3">
        <h2 id="placement-results" className="sr-only">
          Historical placements
        </h2>
        {awaitingTime ? (
          <EmptyState
            icon={Medal}
            title="Enter a time to begin"
            description="Type a 5K time like 19:30, or choose one from your profile."
          />
        ) : isPending ? (
          <LoadingState variant="card" label="Calculating historical placements" />
        ) : isError ? (
          <ErrorState error={error} title="Placements could not be calculated" onRetry={() => refetch()} />
        ) : data.results.length === 0 ? (
          data.mode === 'adjusted' && data.modeNote ? (
            <EmptyState icon={SearchX} title="Course adjustment unavailable" description={data.modeNote} />
          ) : (
            <EmptyState
              icon={SearchX}
              title="Not enough results in this period"
              description="No events within your travel limit have usable results for this period. Try a longer period or travel limit."
            />
          )
        ) : (
          <div className={isPlaceholderData ? 'space-y-3 opacity-60 transition-opacity' : 'space-y-3 transition-opacity'} aria-busy={isPlaceholderData}>
            {data.modeNote && (
              <AlertBanner tone="caution" title="Raw time">
                {data.modeNote}
              </AlertBanner>
            )}
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm text-muted" aria-live="polite">
                Historically, <strong className="font-bold text-ink">{formatFinishTime(data.timeSeconds)}</strong>
                {data.mode === 'adjusted' && data.source && (
                  <>
                    {' '}
                    at <strong className="font-bold text-ink">{data.source.name}</strong>, converted to each course,
                  </>
                )}{' '}
                would have placed like this at{' '}
                <strong className="font-bold text-ink">
                  {data.results.length} {data.results.length === 1 ? 'event' : 'events'}
                </strong>{' '}
                within {data.maxTravelMinutes} min, over {windowLabel}.
              </p>
              {data.results.length >= 2 && (
                <ButtonLink
                  to={`/compare?ids=${data.results.slice(0, 3).map((r) => r.event.id).join(',')}&time=${data.timeSeconds}${
                    data.mode === 'adjusted' && data.source ? `&from=${data.source.eventId}` : ''
                  }`}
                  variant="ghost"
                  className="min-h-9 shrink-0 px-2"
                >
                  <Columns3 className="size-4" aria-hidden />
                  Compare events
                </ButtonLink>
              )}
            </div>
            <ol className="space-y-3">
              {data.results.map((p) => (
                <li key={p.event.id}>
                  <PlacementCard placement={p} target={target} />
                </li>
              ))}
            </ol>
            {data.unavailable.length > 0 && (
              <p className="text-xs text-muted">
                Not course-adjusted ({LIMITED_MATCHED.toLowerCase()}): {data.unavailable.map((u) => u.name).join(', ')}.
              </p>
            )}
            {data.eventsWithoutData > 0 && (
              <p className="text-xs text-muted">
                {data.eventsWithoutData} {data.eventsWithoutData === 1 ? 'event has' : 'events have'} no usable results in this period.
              </p>
            )}
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
