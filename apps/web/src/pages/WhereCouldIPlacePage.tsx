import {
  DEFAULT_HISTORY_WINDOW,
  DEFAULT_PLACEMENT_TARGET,
  formatFinishTime,
  HISTORY_WINDOWS,
  PLACEMENT_TARGETS,
  COURSE_NOT_MODELLED_MESSAGE,
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
import { LIMITED_MATCHED, RAW_FALLBACK_LABEL } from '../lib/display';
import { currentFormSeconds, defaultRunnerTimeSource, profileExternalCourse, profileSourceEvent, resolveRunnerTime } from '../lib/runnerTime';

const MODE_HELP: Record<PlacementMode, string> = {
  adjusted:
    'Your time is converted to an equivalent at each course using Course Speed Factors from runners who ran at both, then compared with past results. Equivalents are historical conversions, not predicted finish times.',
  raw: 'The exact same time is compared with past results at every event, whatever the course.',
};

const RELIABLE = new Set(['high', 'medium']);

const FORM_HELP =
  'Your Current Form is a course-neutral estimate of your present ability. It is converted to an equivalent at each course using that course’s Speed Factor, then compared with past results. Equivalents are not predicted finish times.';

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

  // Forward-looking default: Current Form when there is one, else the next supported reference.
  const source = oneOf<RunnerTimeSourceId>(params.get('src'), RUNNER_TIME_SOURCES.map((s) => s.id), profile ? defaultRunnerTimeSource(profile) : 'current');
  /** Current Form is already course-neutral: the server converts it (form × target factor). */
  const isForm = source === 'current';
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
  // A preset run at a course 5K Compass does not model can never be course-adjusted, and is never
  // re-attributed to a modelled event.
  const externalCourse = profileExternalCourse(source, profile);
  const achievedAt = isForm || externalCourse != null || fromParam === 'none' ? null : (fromParam ?? profileSourceEvent(source, profile)?.id ?? null);
  const achievedEvent = events?.find((e) => e.id === achievedAt) ?? null;
  const adjustable = achievedEvent != null && achievedEvent.scores?.courseSpeedFactor != null && RELIABLE.has(achievedEvent.scores.courseSpeedConfidence);
  const modeParam = params.get('mode');
  // An explicit choice wins. Otherwise (auto): course adjusted whenever a reliable source event is
  // known, else raw time, clearly labelled as a fallback. An event-less time (e.g. an estimated
  // current form) is never treated as if it had been run at a reference course.
  const mode: PlacementMode = modeParam === 'raw' ? 'raw' : modeParam === 'adjusted' || adjustable || isForm ? 'adjusted' : 'raw';
  const adjustedUnavailable = isForm
    ? null
    : externalCourse != null
      ? COURSE_NOT_MODELLED_MESSAGE
      : achievedAt == null
      ? 'Course adjustment requires a source event: choose where this time was achieved.'
      : events && !adjustable
        ? `Course adjustment unavailable at ${achievedEvent?.name ?? 'this event'} — ${LIMITED_MATCHED.toLowerCase()}.`
        : null;
  /** Auto mode fell back to raw time: always labelled as such. */
  const autoFallback = modeParam == null && mode === 'raw' && adjustedUnavailable != null;
  /** Course adjusted chosen, but the time has no known source event: ask instead of showing raw results. */
  const needsSource = mode === 'adjusted' && achievedAt == null && !isForm;
  const formMissing = profile != null && currentFormSeconds(profile) == null;
  const sourcePresets = (['recent', 'pb'] as const)
    .map((id) => ({ id, event: profileSourceEvent(id, profile), seconds: resolveRunnerTime(id, profile, null) }))
    .filter((p) => p.event != null && p.seconds != null && !(p.id === source && fromParam == null));
  const achievedId = useId();

  // Wait for the event list before choosing the default mode, so results do not flip from raw to adjusted.
  const modeKnown = achievedAt == null || events != null || modeParam != null;
  const { data, isPending, isError, error, refetch, isPlaceholderData, fetchStatus } = usePlacement({
    timeSeconds: modeKnown && !needsSource ? timeSeconds : null,
    window,
    target,
    maxTravel,
    mode,
    basis: isForm ? 'current_form' : undefined,
    source: isForm ? undefined : (achievedAt ?? undefined),
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
          {formMissing && (
            <p className="mt-2 text-xs text-muted" role="note">
              {`Current Form unavailable: ${profile!.currentForm.limitedReason ?? 'not enough recent performances at modelled courses.'}`} Your PBs are history, not current form.
            </p>
          )}
          <div className="mt-3">
            <label htmlFor={achievedId} className="mb-1.5 block text-sm font-semibold">
              Achieved at
            </label>
            <select
              id={achievedId}
              value={isForm ? 'form' : externalCourse != null ? 'external' : (achievedAt ?? 'none')}
              disabled={isForm || externalCourse != null}
              onChange={(e) => update({ from: e.target.value, mode: null })}
              className="min-h-11 w-full rounded-full border border-line bg-surface px-4 text-base focus:border-brand-700 focus:outline-none disabled:bg-canvas disabled:text-muted"
            >
              {isForm && <option value="form">Current Form (course-neutral, no single event)</option>}
              {externalCourse != null && <option value="external">{externalCourse} (not modelled by 5K Compass)</option>}
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
              { value: 'adjusted' as const, label: 'Course adjusted' },
              { value: 'raw' as const, label: 'Raw time' },
            ]}
            value={mode}
            onChange={(m) => update({ mode: m })}
          />
          <p className="mt-2 text-xs text-muted">{isForm && mode === 'adjusted' ? FORM_HELP : MODE_HELP[mode]}</p>
          {mode === 'raw' && adjustedUnavailable && <p className="mt-1 text-xs text-subtle">{adjustedUnavailable}</p>}
          {needsSource && (
            <div className="mt-3 rounded-2xl border border-caution bg-caution-bg p-3 text-sm" role="note" aria-label="Course adjustment needs a source event">
              {externalCourse != null ? (
                <>
                  <p className="font-bold">Course adjustment unavailable</p>
                  <p className="mt-1 text-xs text-muted">
                    {COURSE_NOT_MODELLED_MESSAGE} ({externalCourse}) It still counts as a 5K performance: compare it as a raw time
                    {sourcePresets.length > 0 ? ', or use a time with a known course:' : '.'}
                  </p>
                  <button
                    type="button"
                    onClick={() => update({ mode: 'raw' })}
                    className="mt-2 inline-flex min-h-10 items-center rounded-full border border-line bg-surface px-3 text-xs font-semibold hover:bg-zinc-50"
                  >
                    Compare as raw time
                  </button>
                </>
              ) : (
                <>
                  <p className="font-bold">Course adjustment requires a source event</p>
                  <p className="mt-1 text-xs text-muted">
                    This time has no known course.{' '}
                    Choose where it was achieved above{sourcePresets.length > 0 ? ', or use a time with a known course:' : ', or switch to Raw time.'}
                  </p>
                </>
              )}
              {sourcePresets.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {sourcePresets.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => update({ src: p.id, from: null, time: null, mode: 'adjusted' })}
                      className="inline-flex min-h-10 items-center rounded-full border border-line bg-surface px-3 text-xs font-semibold hover:bg-zinc-50"
                    >
                      Use {p.id === 'recent' ? 'Recent best' : 'Overall 5K PB'} {formatFinishTime(p.seconds!)} ({p.event!.name})
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
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
        {needsSource && timeSeconds != null ? (
          externalCourse != null ? (
            <EmptyState icon={Medal} title="Course adjustment unavailable" description={`${COURSE_NOT_MODELLED_MESSAGE} Switch to Raw time to compare it unchanged.`} />
          ) : (
            <EmptyState
              icon={Medal}
              title="Choose where this time was achieved"
              description="Course-adjusted placements need the event where the time was run. Pick it under “Achieved at”, use Recent best or Overall 5K PB, or switch to Raw time."
            />
          )
        ) : awaitingTime ? (
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
            {data.mode === 'raw' && (autoFallback || data.modeNote) && (
              <AlertBanner tone="caution" title={RAW_FALLBACK_LABEL}>
                {autoFallback ? adjustedUnavailable : data.modeNote} These placements compare the time unchanged at every course.
              </AlertBanner>
            )}
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm text-muted" aria-live="polite">
                Historically, {data.formReference && 'your Current Form '}
                <strong className="font-bold text-ink">
                  {data.formReference && '≈ '}
                  {formatFinishTime(data.timeSeconds)}
                </strong>
                {data.mode === 'adjusted' && data.formReference && ', converted to each course,'}
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
                  to={`/compare?ids=${data.results.slice(0, 3).map((r) => r.event.id).join(',')}&time=${data.formReference ? 'form' : data.timeSeconds}${
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
