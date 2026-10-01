import { formatLongDate, type Goal } from '@runsaturday/shared';
import { BellRing, MapPin, Search } from 'lucide-react';
import { useState } from 'react';
import { BestPickCard } from '../components/events/BestPickCard';
import { EventCard } from '../components/events/EventCard';
import { GoalSelector } from '../components/goals/GoalSelector';
import { AlertBanner } from '../components/ui/AlertBanner';
import { ButtonLink } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { ErrorState } from '../components/ui/ErrorState';
import { LoadingState } from '../components/ui/LoadingState';
import { SectionHeading } from '../components/ui/PageHeader';
import { useBestPick, useNearbyEvents, useProfile } from '../hooks/queries';
import { upcomingSaturday } from '../lib/saturday';

function BestPickSection({ goal }: { goal: Goal }) {
  const { data, isPending, isError, error, refetch, isPlaceholderData } = useBestPick(goal);

  if (isPending) return <LoadingState variant="card" label="Finding your best pick" />;
  if (isError) return <ErrorState error={error} title="Recommendations could not be loaded" onRetry={() => refetch()} />;
  if (!data.pick) {
    return (
      <EmptyState
        icon={Search}
        title="No pick for this goal yet"
        description={data.message ?? 'Try another goal.'}
        action={<ButtonLink to="/explore" variant="secondary">Browse all events</ButtonLink>}
      />
    );
  }
  return (
    <div className={isPlaceholderData ? 'opacity-60 transition-opacity' : 'transition-opacity'} aria-busy={isPlaceholderData}>
      <BestPickCard recommendation={data.pick} method={data.method} />
    </div>
  );
}

function NearYouSection() {
  const { data, isPending, isError, error, refetch } = useNearbyEvents(5);
  return (
    <section aria-labelledby="near-you">
      <SectionHeading action={<ButtonLink to="/explore" variant="ghost" className="min-h-8 px-2">See all</ButtonLink>}>
        <span id="near-you">Near you</span>
      </SectionHeading>
      {isPending ? (
        <LoadingState rows={3} label="Loading nearby events" />
      ) : isError ? (
        <ErrorState error={error} title="Nearby events could not be loaded" onRetry={() => refetch()} />
      ) : data.length === 0 ? (
        <EmptyState
          icon={MapPin}
          title="No nearby events found"
          description="Choose a home location to see events near you."
          action={<ButtonLink to="/profile" variant="secondary">Set location</ButtonLink>}
        />
      ) : (
        <ul className="space-y-2">
          {data.map((event) => (
            <li key={event.id}>
              <EventCard event={event} />
            </li>
          ))}
        </ul>
      )}
    </section>
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
          ? `Cancellations and condition alerts for your ${saved} saved ${saved === 1 ? 'event' : 'events'} will appear here.`
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
    <div className="space-y-6">
      <header className="pt-5">
        <div className="flex items-center justify-between">
          <p className="text-lg font-extrabold tracking-tight">
            Run<span className="text-brand-700">Saturday</span>
          </p>
          <BellRing className="size-5 text-subtle" aria-hidden />
        </div>
        <p className="mt-4 text-sm font-semibold text-brand-700">{formatLongDate(upcomingSaturday())}</p>
        <h1 className="text-3xl font-bold tracking-tight">Where are you running?</h1>
      </header>

      <BestPickSection goal={activeGoal} />

      <section aria-labelledby="goal-heading">
        <SectionHeading>
          <span id="goal-heading">What do you want this Saturday?</span>
        </SectionHeading>
        <GoalSelector value={activeGoal} onChange={setGoal} />
      </section>

      <NearYouSection />
      <AlertsSection />
    </div>
  );
}
