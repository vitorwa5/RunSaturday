import { formatFinishTime, GOALS } from '@runsaturday/shared';
import { Heart, MapPin, ShieldCheck } from 'lucide-react';
import { Card } from '../components/ui/Card';
import { DefinitionList } from '../components/ui/DefinitionList';
import { DemoBadge } from '../components/ui/DemoBadge';
import { ErrorState } from '../components/ui/ErrorState';
import { LoadingState } from '../components/ui/LoadingState';
import { MetricCard } from '../components/ui/MetricCard';
import { PageHeader, SectionHeading } from '../components/ui/PageHeader';
import { useProfile } from '../hooks/queries';

const time = (s: number | null) => (s == null ? 'Not set' : formatFinishTime(s));

export function ProfilePage() {
  const { data: profile, isPending, isError, error, refetch } = useProfile();

  return (
    <div className="space-y-6">
      <PageHeader title="Profile" subtitle={profile ? profile.displayName : undefined} actions={profile?.isDemo ? <DemoBadge /> : null} />

      {isPending ? (
        <LoadingState variant="card" label="Loading profile" />
      ) : isError ? (
        <ErrorState error={error} title="Profile could not be loaded" onRetry={() => refetch()} />
      ) : (
        <>
          <section aria-labelledby="performance">
            <SectionHeading>
              <span id="performance">Running level</span>
            </SectionHeading>
            <div className="grid grid-cols-3 gap-2">
              <MetricCard label="Current" value={time(profile.current5kEstimateSeconds)} hint="5K estimate" />
              <MetricCard label="Recent best" value={time(profile.recentPbSeconds)} hint="Last 90 days" />
              <MetricCard label="Lifetime PB" value={time(profile.lifetimePbSeconds)} />
            </div>
            <p className="mt-2 text-xs text-muted">Recommendations will use your current form by default, not an old lifetime PB.</p>
          </section>

          <section aria-labelledby="history" className="grid grid-cols-3 gap-2">
            <h2 id="history" className="sr-only">History</h2>
            <MetricCard label="Runs" value={profile.runsCompleted} />
            <MetricCard label="Events" value={profile.uniqueEventsVisited} hint="visited" />
            <MetricCard label="Distance" value={profile.runsCompleted * 5} suffix="km" />
          </section>

          <section aria-labelledby="preferences">
            <SectionHeading>
              <span id="preferences">Preferences</span>
            </SectionHeading>
            <DefinitionList
              items={[
                {
                  label: 'Home location',
                  value: profile.home ? (
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="size-3.5" aria-hidden />
                      {profile.home.label ?? 'Set'}
                    </span>
                  ) : (
                    'Not set'
                  ),
                },
                { label: 'Travel limit', value: `${profile.defaultTravelMinutes} min` },
                { label: 'Preferred goal', value: GOALS.find((g) => g.id === profile.preferredGoal)?.label ?? '—' },
                {
                  label: 'Saved events',
                  value: (
                    <span className="inline-flex items-center gap-1">
                      <Heart className="size-3.5" aria-hidden />
                      {profile.savedEventIds.length}
                    </span>
                  ),
                },
              ]}
            />
            <p className="mt-2 text-xs text-muted">Editing preferences, challenges and tourism stats arrive with accounts (Phase 9).</p>
          </section>
        </>
      )}

      <Card>
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 size-5 shrink-0 text-muted" aria-hidden />
          <div className="text-sm text-muted">
            <h2 className="font-semibold text-ink">Privacy and independence</h2>
            <p className="mt-1">
              Location is optional and only used to find events near you. 5K Compass is an independent app and is not affiliated
              with, or endorsed by, parkrun or any event organiser.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
