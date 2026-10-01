import { formatLongDate, goalDefinition, type Goal } from '@runsaturday/shared';
import { ArrowRight, Flag, SearchX } from 'lucide-react';
import { useState } from 'react';
import { BestPickCard } from '../components/events/BestPickCard';
import { EventCard } from '../components/events/EventCard';
import { GoalSelector } from '../components/goals/GoalSelector';
import { ToolLinks } from '../components/navigation/ToolLinks';
import { AlertBanner } from '../components/ui/AlertBanner';
import { ButtonLink } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { ErrorState } from '../components/ui/ErrorState';
import { LoadingState } from '../components/ui/LoadingState';
import { SectionHeading } from '../components/ui/PageHeader';
import { useBestPick, useProfile } from '../hooks/queries';
import { upcomingSaturday } from '../lib/saturday';

function plannerLink(goal: Goal) {
  return `/saturday?goal=${goal}`;
}

/** Best pick for the chosen goal, plus a few alternatives, from one request. */
function Recommendations({ goal }: { goal: Goal }) {
  const { data, isPending, isError, error, refetch, isPlaceholderData } = useBestPick(goal);

  if (isPending) {
    return (
      <>
        <LoadingState variant="card" label="Finding your best pick" />
        <div className="mt-6">
          <LoadingState rows={3} label="Loading other options" />
        </div>
      </>
    );
  }
  if (isError) return <ErrorState error={error} title="Recommendations could not be loaded" onRetry={() => refetch()} />;

  const busy = isPlaceholderData ? 'opacity-60 transition-opacity' : 'transition-opacity';

  if (!data.pick) {
    const unavailable = !goalDefinition(goal).available;
    return (
      <EmptyState
        icon={unavailable ? Flag : SearchX}
        title={unavailable ? `${goalDefinition(goal).label} isn't available yet` : 'No pick for this goal yet'}
        description={data.message ?? 'Try another goal.'}
        action={
          unavailable ? undefined : (
            <ButtonLink to={plannerLink(goal)} variant="secondary">
              Adjust in the planner
            </ButtonLink>
          )
        }
      />
    );
  }

  return (
    <div className={busy} aria-busy={isPlaceholderData}>
      <BestPickCard recommendation={data.pick} method={data.method} />
      {data.alternatives.length > 0 && (
        <section aria-labelledby="other-options" className="mt-8">
          <SectionHeading
            action={
              <ButtonLink to={plannerLink(goal)} variant="ghost" className="min-h-8 px-2">
                Plan in detail <ArrowRight className="size-4" aria-hidden />
              </ButtonLink>
            }
          >
            <span id="other-options">Other options</span>
          </SectionHeading>
          <ul className="space-y-2">
            {data.alternatives.map((r) => (
              <li key={r.event.id}>
                <EventCard event={r.event} />
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
  const [goal, setGoal] = useState<Goal | null>(null);
  const activeGoal = goal ?? profile?.preferredGoal ?? 'pb';

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

      <section aria-labelledby="goal-heading">
        <SectionHeading>
          <span id="goal-heading">What do you want this Saturday?</span>
        </SectionHeading>
        <GoalSelector value={activeGoal} onChange={setGoal} />
      </section>

      <Recommendations goal={activeGoal} />

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
