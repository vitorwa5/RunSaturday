import { COMPARE_MAX_EVENTS, COMPARE_MIN_EVENTS, formatFinishTime, type UserProfile } from '@runsaturday/shared';
import { Columns3, Plus, X } from 'lucide-react';
import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { CompareTable } from '../components/compare/CompareTable';
import { EventPicker } from '../components/compare/EventPicker';
import { AlertBanner } from '../components/ui/AlertBanner';
import { Button } from '../components/ui/Button';
import { ChoiceChips } from '../components/ui/ChoiceChips';
import { EmptyState } from '../components/ui/EmptyState';
import { ErrorState } from '../components/ui/ErrorState';
import { LoadingState } from '../components/ui/LoadingState';
import { PageHeader } from '../components/ui/PageHeader';
import { useCompare, useEvents, useProfile } from '../hooks/queries';
import { RAW_FALLBACK_LABEL } from '../lib/display';
import { parseIdList, profileSourceEvent, PROFILE_TIME_FIELD } from '../lib/runnerTime';

const TIME_CHOICES = [
  { id: 'current', label: 'Current form (estimate)' },
  { id: 'recent', label: 'Recent best' },
  { id: 'pb', label: 'Lifetime PB' },
] as const;

/** Option value "seconds" or "seconds@eventId" (where the time was achieved, for course adjustment). */
const timeValue = (seconds: number, from: string | null | undefined) => (from ? `${seconds}@${from}` : String(seconds));

function timeOptions(profile: UserProfile | undefined, timeSeconds: number | undefined, from: string | null) {
  const options: { value: string; label: string }[] = [];
  for (const c of TIME_CHOICES) {
    const s = profile?.[PROFILE_TIME_FIELD[c.id]];
    if (s != null) options.push({ value: timeValue(s, profileSourceEvent(c.id, profile)?.id), label: `${c.label} ${formatFinishTime(s)}` });
  }
  // A time passed in the URL (e.g. from Where Could I Place?) that is not a profile time.
  if (timeSeconds != null && !options.some((o) => o.value === timeValue(timeSeconds, from))) {
    options.unshift({ value: timeValue(timeSeconds, from), label: formatFinishTime(timeSeconds) });
  }
  options.push({ value: 'off', label: 'No time' });
  return options;
}

export function ComparePage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const ids = parseIdList(params.get('ids'), COMPARE_MAX_EVENTS);
  const { data: profile } = useProfile();
  // No time in the URL → the runner's current form (when known); "off" → no placement rows.
  const timeParam = params.get('time');
  const timeRaw = Number(timeParam);
  const timeSeconds =
    timeParam === 'off'
      ? undefined
      : Number.isInteger(timeRaw) && timeRaw > 0
        ? timeRaw
        : (profile?.current5kEstimateSeconds ?? undefined);
  // Where the time was achieved (only with an explicit time): enables course-adjusted placement.
  const from = timeParam != null && timeParam !== 'off' ? params.get('from') : null;
  const [pickerOpen, setPickerOpen] = useState(ids.length < COMPARE_MIN_EVENTS);

  const { data: events } = useEvents();
  // Wait for the profile before the first comparison so the default time is applied once.
  const { data, isPending, isError, error, refetch, isPlaceholderData } = useCompare({ ids: profile || timeParam ? ids : [], timeSeconds, source: from ?? undefined });

  // Built by hand so shared links keep readable commas (?ids=a,b) rather than %2C.
  const go = (nextIds: string[], nextTime: number | 'off' | undefined, nextFrom: string | null = null) => {
    const parts = [
      nextIds.length > 0 ? `ids=${nextIds.map(encodeURIComponent).join(',')}` : null,
      nextTime != null ? `time=${nextTime}` : null,
      nextTime != null && nextTime !== 'off' && nextFrom ? `from=${encodeURIComponent(nextFrom)}` : null,
    ].filter(Boolean);
    navigate({ search: parts.length ? `?${parts.join('&')}` : '' }, { replace: true, preventScrollReset: true });
  };
  const setIds = (next: string[]) => go(next, timeParam === 'off' ? 'off' : timeParam != null ? timeSeconds : undefined, from);
  const toggle = (id: string) => setIds(ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id].slice(0, COMPARE_MAX_EVENTS));
  const setTime = (value: string) => {
    if (value === 'off') return go(ids, 'off');
    const [seconds, eventId] = value.split('@');
    go(ids, Number(seconds), eventId ?? null);
  };
  const nameOf = (id: string) => events?.find((e) => e.id === id)?.name ?? id;

  return (
    <div className="space-y-5">
      <PageHeader back title="Compare events" subtitle="Put 2–4 events side by side." />

      <section aria-label="Selected events" className="space-y-3">
        <ul className="flex flex-wrap gap-2">
          {ids.map((id) => (
            <li key={id}>
              <span className="inline-flex min-h-10 items-center gap-1 rounded-full border border-brand-700 bg-brand-50 pr-1 pl-3 text-sm font-semibold text-brand-800">
                {nameOf(id)}
                <button type="button" onClick={() => toggle(id)} aria-label={`Remove ${nameOf(id)}`} className="inline-flex size-8 items-center justify-center rounded-full hover:bg-brand-100">
                  <X className="size-4" aria-hidden />
                </button>
              </span>
            </li>
          ))}
          {!pickerOpen && ids.length < COMPARE_MAX_EVENTS && (
            <li>
              <Button variant="secondary" className="min-h-10" onClick={() => setPickerOpen(true)}>
                <Plus className="size-4" aria-hidden />
                Add event
              </Button>
            </li>
          )}
        </ul>
        {pickerOpen && events && <EventPicker events={events} selected={ids} onToggle={toggle} onDone={() => setPickerOpen(false)} />}
      </section>

      <section aria-label="Runner time" className="space-y-2">
        <p className="text-sm font-bold">Compare historical placement for</p>
        <ChoiceChips label="Runner time" scroll options={timeOptions(profile, timeSeconds, from)} value={timeSeconds != null ? timeValue(timeSeconds, from) : 'off'} onChange={setTime} />
      </section>

      {ids.length < COMPARE_MIN_EVENTS ? (
        <EmptyState
          icon={Columns3}
          title={`Choose at least ${COMPARE_MIN_EVENTS} events`}
          description={`Pick ${COMPARE_MIN_EVENTS}–${COMPARE_MAX_EVENTS} events to compare scores, course facts, travel and, with a time, historical placement.`}
          action={
            !pickerOpen ? (
              <Button onClick={() => setPickerOpen(true)}>
                <Plus className="size-4" aria-hidden />
                Add events
              </Button>
            ) : undefined
          }
        />
      ) : isPending ? (
        <LoadingState variant="card" label="Comparing events" />
      ) : isError ? (
        <ErrorState error={error} title="Comparison could not load" onRetry={() => refetch()} />
      ) : (
        <div className={isPlaceholderData ? 'space-y-3 opacity-60 transition-opacity' : 'space-y-3 transition-opacity'} aria-busy={isPlaceholderData}>
          {data.missing.length > 0 && (
            <AlertBanner tone="caution" title={`${data.missing.length === 1 ? 'An event' : 'Some events'} could not be found`}>
              {data.missing.join(', ')} {data.missing.length === 1 ? 'is' : 'are'} no longer available and {data.missing.length === 1 ? 'was' : 'were'} left out.
            </AlertBanner>
          )}
          {data.events.length >= COMPARE_MIN_EVENTS ? (
            <>
              {data.timeSeconds != null && data.mode === 'raw' && (
                <p className="rounded-2xl bg-caution-bg px-3 py-2 text-xs text-caution" role="note">
                  <strong>{RAW_FALLBACK_LABEL}.</strong> {formatFinishTime(data.timeSeconds)} has no known source event, so placement rows compare it unchanged.
                  Choose Recent best or Lifetime PB (run at a known course) for course-adjusted equivalents.
                </p>
              )}
              <CompareTable data={data} />
              <p className="text-xs text-subtle">
                “Best” marks the most favourable value where one is clearly better. Competition and field size are not marked: what suits you depends on your goal.
                Course Speed Factor (course_speed_v1) compares the same runners across events; 1.000 is the geometric mean of the analysed course cohort (a
                cohort reference, not a neutral course) and lower is historically faster. PB Score (pb_v1) is 75% course
                speed and 25% structural ease. Competition (competition_v1) is relative to the events analysed over 90 days; Difficulty (difficulty_v1) is a
                structural course rating.
                {data.timeSeconds != null &&
                  (data.mode === 'adjusted' && data.source
                    ? ` Placement rows convert ${formatFinishTime(data.timeSeconds)} at ${data.source.name} to an equivalent at each course, then show where it would historically have placed in the last 90 days. Equivalents are not predicted finish times.`
                    : ` Placement rows show where ${formatFinishTime(data.timeSeconds)} would historically have placed in the last 90 days.`)}{' '}
                Travel times are estimates.
              </p>
            </>
          ) : (
            <EmptyState icon={Columns3} title="Add another event" description="At least two available events are needed for a comparison." />
          )}
        </div>
      )}
    </div>
  );
}
