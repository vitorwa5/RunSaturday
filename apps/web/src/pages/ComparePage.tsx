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
import { parseIdList, PROFILE_TIME_FIELD } from '../lib/runnerTime';

const TIME_CHOICES = [
  { id: 'current', label: 'Current form' },
  { id: 'recent', label: 'Recent best' },
  { id: 'pb', label: 'Lifetime PB' },
] as const;

function timeOptions(profile: UserProfile | undefined, timeSeconds: number | undefined) {
  const options: { value: string; label: string }[] = [];
  for (const c of TIME_CHOICES) {
    const s = profile?.[PROFILE_TIME_FIELD[c.id]];
    if (s != null) options.push({ value: String(s), label: `${c.label} ${formatFinishTime(s)}` });
  }
  // A time passed in the URL (e.g. from Where Could I Place?) that is not a profile time.
  if (timeSeconds != null && !options.some((o) => o.value === String(timeSeconds))) {
    options.unshift({ value: String(timeSeconds), label: formatFinishTime(timeSeconds) });
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
  const [pickerOpen, setPickerOpen] = useState(ids.length < COMPARE_MIN_EVENTS);

  const { data: events } = useEvents();
  // Wait for the profile before the first comparison so the default time is applied once.
  const { data, isPending, isError, error, refetch, isPlaceholderData } = useCompare({ ids: profile || timeParam ? ids : [], timeSeconds });

  // Built by hand so shared links keep readable commas (?ids=a,b) rather than %2C.
  const go = (nextIds: string[], nextTime: number | 'off' | undefined) => {
    const parts = [
      nextIds.length > 0 ? `ids=${nextIds.map(encodeURIComponent).join(',')}` : null,
      nextTime != null ? `time=${nextTime}` : null,
    ].filter(Boolean);
    navigate({ search: parts.length ? `?${parts.join('&')}` : '' }, { replace: true, preventScrollReset: true });
  };
  const setIds = (next: string[]) => go(next, timeParam === 'off' ? 'off' : timeParam != null ? timeSeconds : undefined);
  const toggle = (id: string) => setIds(ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id].slice(0, COMPARE_MAX_EVENTS));
  const setTime = (value: string) => go(ids, value === 'off' ? 'off' : Number(value));
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
        <ChoiceChips label="Runner time" scroll options={timeOptions(profile, timeSeconds)} value={timeSeconds != null ? String(timeSeconds) : 'off'} onChange={setTime} />
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
              <CompareTable data={data} />
              <p className="text-xs text-subtle">
                “Best” marks the most favourable value where one is clearly better. Competition and field size are not marked: what suits you depends on your goal.
                {data.timeSeconds != null && ` Placement rows show where ${formatFinishTime(data.timeSeconds)} would historically have placed in the last 90 days.`} Travel times are estimates.
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
