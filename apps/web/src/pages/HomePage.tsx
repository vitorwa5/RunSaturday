import { DEFAULT_PLANNER_FILTERS, formatFinishTime, formatLongDate, type Goal, type SaturdayRecommendationsResponse } from '@runsaturday/shared';
import { ArrowRight, RefreshCw, SearchX } from 'lucide-react';
import { Link, useSearchParams } from 'react-router';
import { BestPickCard } from '../components/events/BestPickCard';
import { EventCard } from '../components/events/EventCard';
import { IntentSelector } from '../components/goals/IntentSelector';
import { ToolLinks } from '../components/navigation/ToolLinks';
import { ChallengePicker } from '../components/saturday/ChallengePicker';
import { SaturdayNotes } from '../components/saturday/SaturdayNotes';
import { AlertBanner } from '../components/ui/AlertBanner';
import { Button, ButtonLink } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { ErrorState } from '../components/ui/ErrorState';
import { LoadingState } from '../components/ui/LoadingState';
import { SectionHeading } from '../components/ui/PageHeader';
import { useProfile, useSaturday } from '../hooks/queries';
import { parsePlannerParams, saturdayLink, withIntent, type PlannerSelection } from '../lib/plannerParams';
import { upcomingSaturday } from '../lib/saturday';

/** Intent-specific context shown above the best match (only what the intent needs). */
function IntentContext({ data, selection, onChange }: { data: SaturdayRecommendationsResponse; selection: PlannerSelection; onChange: (s: PlannerSelection) => void }) {
  const { data: profile } = useProfile();
  switch (data.intent) {
    case 'pb':
    case 'place': {
      const form = profile?.currentForm;
      return form?.status === 'estimate' && form.formSeconds != null ? (
        <p className="text-sm text-muted">
          Your Current Form <strong className="text-ink tabular-nums">≈ {formatFinishTime(form.formSeconds)}</strong> ({form.confidence.level} confidence) ·{' '}
          <Link to="/profile/current-form" className="font-semibold text-brand-700">
            How it's calculated
          </Link>
        </p>
      ) : (
        <p className="text-sm text-muted">Current Form is unavailable, so no Current Form equivalents are shown.</p>
      );
    }
    case 'new_event':
      return (
        <p className="text-sm text-muted">
          <strong className="text-ink tabular-nums">{data.results.length}</strong> {data.results.length === 1 ? 'event' : 'events'} new to you within {data.maxTravelMinutes} min
        </p>
      );
    case 'challenge':
      return data.challenge ? <ChallengePicker context={data.challenge} onChange={(c) => onChange({ ...selection, challenge: c.challenge, item: c.item })} /> : null;
    default:
      return null;
  }
}

/** Best match for the selected intent and a few other good options, from the Saturday orchestrator. */
function Recommendations({ selection, onChange }: { selection: PlannerSelection; onChange: (s: PlannerSelection) => void }) {
  const { data, isPending, isError, error, refetch, isPlaceholderData } = useSaturday(selection);

  if (isPending) {
    return (
      <>
        <LoadingState variant="card" label="Finding your best match" />
        <div className="mt-6">
          <LoadingState rows={3} label="Loading other options" />
        </div>
      </>
    );
  }
  if (isError) return <ErrorState error={error} title="Recommendations could not be loaded" onRetry={() => refetch()} />;

  const plan = saturdayLink({ ...selection, intent: data.intent });
  const busy = isPlaceholderData ? 'space-y-4 opacity-60 transition-opacity' : 'space-y-4 transition-opacity';

  return (
    <div className={busy} aria-busy={isPlaceholderData}>
      <IntentContext data={data} selection={selection} onChange={onChange} />
      {data.bestPick ? (
        <>
          <BestPickCard recommendation={data.bestPick} method={data.method} />
          {data.intent === 'surprise' && data.surprise && data.surprise.shortlist > 1 && (
            <Button variant="secondary" className="w-full" onClick={() => onChange({ ...selection, offset: data.surprise!.offset + 1 })}>
              <RefreshCw className="size-4" aria-hidden />
              Show me another
            </Button>
          )}
          <SaturdayNotes data={data} compact />
          {data.alternatives.length === 0 && (
            <ButtonLink to={plan} variant="ghost" className="min-h-9 px-2">
              Plan in detail <ArrowRight className="size-4" aria-hidden />
            </ButtonLink>
          )}
        </>
      ) : (
        <EmptyState
          icon={SearchX}
          title="No match for this goal yet"
          description={data.message ?? 'Try another goal.'}
          action={
            <ButtonLink to={plan} variant="secondary">
              Adjust in the planner
            </ButtonLink>
          }
        />
      )}
      {data.alternatives.length > 0 && (
        <section aria-labelledby="other-options" className="pt-4">
          <SectionHeading
            action={
              <ButtonLink to={plan} variant="ghost" className="min-h-8 px-2">
                Plan in detail <ArrowRight className="size-4" aria-hidden />
              </ButtonLink>
            }
          >
            <span id="other-options">Other good options</span>
          </SectionHeading>
          <ul className="space-y-2">
            {data.alternatives.map((r) => (
              <li key={r.event.id}>
                <EventCard event={r.event} variant={r.dataConfidence === null ? 'explore' : 'performance'} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function AlertsSection() {
  const { data } = useProfile();
  const saved = data?.savedEventIds.length ?? 0;
  return (
    <section aria-labelledby="alerts">
      <SectionHeading>
        <span id="alerts">Alerts</span>
      </SectionHeading>
      <AlertBanner tone="neutral" title="No alerts right now">
        {saved > 0
          ? `Cancellation and condition alerts for your ${saved} saved ${saved === 1 ? 'event' : 'events'} will appear here.`
          : 'Save events to get cancellation and condition alerts here.'}
      </AlertBanner>
    </section>
  );
}

export function HomePage() {
  const { data: profile } = useProfile();
  const [params, setParams] = useSearchParams();
  // The intent lives in the URL (?intent=…), so Back and shared links keep it. Not stored.
  const parsed = parsePlannerParams(params);
  const intent: Goal = parsed.intent ?? profile?.preferredGoal ?? 'pb';
  const selection: PlannerSelection = { ...parsed, intent, filters: DEFAULT_PLANNER_FILTERS };
  const update = (next: PlannerSelection) => {
    const q = new URLSearchParams({ intent: next.intent! });
    if (next.intent === 'challenge' && next.challenge) q.set('challenge', next.challenge);
    if (next.intent === 'challenge' && next.item) q.set('item', next.item);
    if (next.intent === 'surprise' && next.offset) q.set('offset', String(next.offset));
    setParams(q, { replace: true, preventScrollReset: true });
  };

  return (
    <div className="space-y-8">
      <header className="pt-5">
        <p className="text-lg font-extrabold tracking-tight">
          <span className="text-brand-700">5K</span> Compass
        </p>
        <p className="text-xs font-medium text-subtle">Your guide to Saturday 5Ks.</p>
        <p className="mt-5 text-sm font-semibold text-muted">{formatLongDate(upcomingSaturday())}</p>
        <h1 className="mt-0.5 text-[2rem] leading-tight font-extrabold tracking-tight">Where are you running?</h1>
      </header>

      <section aria-labelledby="intent-heading">
        <SectionHeading>
          <span id="intent-heading">What are you looking for this Saturday?</span>
        </SectionHeading>
        <IntentSelector value={intent} onChange={(i) => update(withIntent(selection, i))} />
      </section>

      <Recommendations selection={selection} onChange={update} />

      <section aria-labelledby="tools-heading">
        <SectionHeading>
          <span id="tools-heading">Saturday tools</span>
        </SectionHeading>
        <ToolLinks />
      </section>

      <AlertsSection />
    </div>
  );
}
