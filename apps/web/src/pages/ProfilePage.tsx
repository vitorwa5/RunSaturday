import { formatDateWithYear, formatFinishTime, GOALS, type UserPerformance, type UserProfile } from '@runsaturday/shared';
import { ChevronRight, Heart, Link2, MapPin, Plus, ShieldCheck, Timer } from 'lucide-react';
import { useId } from 'react';
import { Link } from 'react-router';
import { PerformanceList } from '../components/profile/PerformanceList';
import { CONFIDENCE_SHORT, formatAgo, PERFORMANCE_TYPE_LABEL, TREND_LABEL } from '../lib/display';
import { ConfidenceBadge } from '../components/ui/ConfidenceBadge';
import { ButtonLink } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { DefinitionList } from '../components/ui/DefinitionList';
import { DemoBadge } from '../components/ui/DemoBadge';
import { EmptyState } from '../components/ui/EmptyState';
import { ErrorState } from '../components/ui/ErrorState';
import { LoadingState, Skeleton } from '../components/ui/LoadingState';
import { PageHeader, SectionHeading } from '../components/ui/PageHeader';
import { usePerformances, useProfile } from '../hooks/queries';

const RECENT_SHOWN = 8;

/** A derived best (Overall 5K PB / recent best): opens Where Could I Place? with that preset. */
function BestCard({
  label,
  performance,
  preset,
  emptyText,
  hint,
}: {
  label: string;
  performance: UserPerformance | null;
  preset: 'pb' | 'recent' | 'parkrun';
  emptyText: string;
  hint?: string;
}) {
  if (!performance) {
    return (
      <div className="rounded-2xl border border-line bg-surface p-3">
        <p className="text-[11px] font-semibold tracking-wide text-muted uppercase">{label}</p>
        <p className="mt-1 text-sm text-subtle">{emptyText}</p>
      </div>
    );
  }
  return (
    <Link
      to={`/where-could-i-place?src=${preset}`}
      aria-label={`${label} ${formatFinishTime(performance.finishTimeSeconds)} at ${performance.eventName}: see where it could place`}
      className="block rounded-2xl border border-line bg-surface p-3 hover:bg-zinc-50"
    >
      <p className="text-[11px] font-semibold tracking-wide text-muted uppercase">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums">{formatFinishTime(performance.finishTimeSeconds)}</p>
      <p className="truncate text-xs text-muted">{performance.eventName}</p>
      {performance.performanceType !== 'parkrun' && <p className="text-xs text-muted">{PERFORMANCE_TYPE_LABEL[performance.performanceType]}</p>}
      <p className="text-xs text-subtle">{hint ?? formatDateWithYear(performance.date)}</p>
      {!performance.courseModelled && <p className="text-[11px] text-subtle">Course not modelled</p>}
      <p className="mt-1.5 inline-flex items-center gap-0.5 text-xs font-semibold text-brand-700">
        Where could I place? <ChevronRight className="size-3.5" aria-hidden />
      </p>
    </Link>
  );
}

/** The latest run; opens its event when it was at a course 5K Compass models. */
function LastRun({ latest }: { latest: UserPerformance }) {
  const body = (
    <div className="min-w-0">
      <p className="text-[11px] font-semibold tracking-wide text-muted uppercase">Last run</p>
      <p className="truncate text-sm font-semibold">
        {latest.eventName} · <span className="tabular-nums">{formatFinishTime(latest.finishTimeSeconds)}</span> · {formatDateWithYear(latest.date)}
      </p>
    </div>
  );
  const box = 'flex items-center justify-between gap-2 rounded-2xl border border-line bg-surface p-3';
  return latest.eventId != null ? (
    <Link to={`/event/${latest.eventId}`} className={`${box} hover:bg-zinc-50`}>
      {body}
      <ChevronRight className="size-4 shrink-0 text-subtle" aria-hidden />
    </Link>
  ) : (
    <div className={box}>{body}</div>
  );
}

const ago = (date: string, today: string) => `${formatDateWithYear(date)} · ${formatAgo(date, today)}`;

/** Current Form: a modelled estimate, visibly different from the recorded bests. */
function CurrentFormCard({ profile }: { profile: UserProfile }) {
  const form = profile.currentForm;
  return (
    <Link
      to="/profile/current-form"
      aria-label={
        form.status === 'estimate'
          ? `Current Form about ${formatFinishTime(form.formSeconds!)}, ${CONFIDENCE_SHORT[form.confidence.level]} confidence: how is it calculated?`
          : 'Current Form unavailable: how is it calculated?'
      }
      className="block rounded-2xl border border-brand-700/30 bg-brand-50 p-3 hover:bg-brand-100"
    >
      <p className="text-[11px] font-semibold tracking-wide text-brand-800 uppercase">Current Form</p>
      {form.status === 'estimate' ? (
        <>
          <p className="mt-1 text-2xl font-bold tabular-nums">≈ {formatFinishTime(form.formSeconds!)}</p>
          <p className="mt-1 flex flex-wrap items-center gap-1">
            <ConfidenceBadge level={form.confidence.level} compact />
          </p>
          <p className="mt-1 text-xs text-muted">{TREND_LABEL[form.trend.direction]}</p>
        </>
      ) : (
        <>
          <p className="mt-1 text-sm font-semibold text-muted">Unavailable</p>
          {form.indicativeSeconds != null && <p className="text-xs text-muted">≈ {formatFinishTime(form.indicativeSeconds)} from one run (indicative)</p>}
        </>
      )}
      <p className="mt-1.5 inline-flex items-center gap-0.5 text-xs font-semibold text-brand-700">
        How is it calculated? <ChevronRight className="size-3.5" aria-hidden />
      </p>
    </Link>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-3">
      <p className="text-[11px] font-semibold tracking-wide text-muted uppercase">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
    </div>
  );
}

function RecentPerformances({ total }: { total: number }) {
  const { data, isPending, isError, error, refetch } = usePerformances({ limit: RECENT_SHOWN });
  if (isPending) return <Skeleton className="h-40 w-full rounded-2xl" />;
  if (isError) return <ErrorState error={error} title="Performances could not be loaded" onRetry={() => refetch()} />;
  if (data.performances.length === 0) {
    return (
      <EmptyState
        icon={Timer}
        title="No performances yet"
        description="Add a 5K you have run. Your PBs and recent best are worked out from your performances."
        action={<ButtonLink to="/profile/performances/new">Add performance</ButtonLink>}
      />
    );
  }
  return (
    <div className="space-y-2">
      <PerformanceList performances={data.performances} label="Recent performances" />
      {total > data.performances.length && (
        <Link to="/profile/performances" className="inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-brand-700">
          See all {total} performances <ChevronRight className="size-4" aria-hidden />
        </Link>
      )}
    </div>
  );
}

/** Placeholder only: no connection, scraping or history fetching exists. */
function ConnectParkrun() {
  const inputId = useId();
  return (
    <section aria-labelledby="connect-parkrun" className="rounded-3xl border border-dashed border-line bg-surface p-4">
      <div className="flex items-start justify-between gap-2">
        <h2 id="connect-parkrun" className="flex items-center gap-2 text-base font-semibold">
          <Link2 className="size-4 text-muted" aria-hidden />
          Connect your parkrun history
        </h2>
        <span className="shrink-0 rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-bold text-muted">Coming later</span>
      </div>
      <p className="mt-1 text-sm text-muted">Automatic history import will require a supported data connection.</p>
      <label htmlFor={inputId} className="mt-3 block text-xs font-semibold text-muted">
        parkrun ID
      </label>
      <input
        id={inputId}
        disabled
        placeholder="A1234567"
        aria-describedby={`${inputId}-note`}
        className="mt-1 min-h-11 w-full cursor-not-allowed rounded-full border border-line bg-canvas px-4 text-base text-subtle"
      />
      <p id={`${inputId}-note`} className="mt-1.5 text-xs text-subtle">
        Until then, add performances yourself. 5K Compass never collects barcodes or emergency contact details.
      </p>
    </section>
  );
}

export function ProfilePage() {
  const { data: profile, isPending, isError, error, refetch } = useProfile();
  const summary = profile?.performance;

  return (
    <div className="space-y-6">
      <PageHeader title="Profile" subtitle={profile ? profile.displayName : undefined} actions={profile?.isDemo ? <DemoBadge /> : null} />

      {isPending ? (
        <LoadingState variant="card" label="Loading profile" />
      ) : isError ? (
        <ErrorState error={error} title="Profile could not be loaded" onRetry={() => refetch()} />
      ) : (
        <>
          <section aria-labelledby="performance-summary" className="space-y-2">
            <SectionHeading
              action={
                <ButtonLink to="/profile/performances/new" className="min-h-10 px-3 whitespace-nowrap" aria-label="Add performance">
                  <Plus className="size-4" aria-hidden />
                  Add
                </ButtonLink>
              }
            >
              <span id="performance-summary">Performance summary</span>
            </SectionHeading>
            <div className="grid grid-cols-2 gap-2">
              <BestCard
                label="Overall 5K PB"
                performance={summary!.lifetimePb}
                preset="pb"
                emptyText="No performances yet"
                hint={summary!.lifetimePb ? ago(summary!.lifetimePb.date, summary!.asOfDate) : undefined}
              />
              <BestCard
                label="parkrun PB"
                performance={summary!.parkrunPb}
                preset="parkrun"
                emptyText="No parkrun performances yet"
                hint={summary!.parkrunPb ? ago(summary!.parkrunPb.date, summary!.asOfDate) : undefined}
              />
              <BestCard
                label="Recent best"
                performance={summary!.recentBest}
                preset="recent"
                emptyText={`Nothing in the last ${summary!.recentWindowDays} days`}
                hint={`Last ${summary!.recentWindowDays} days`}
              />
              <CurrentFormCard profile={profile} />
            </div>
            {profile.currentFormGapToOverallPbSeconds != null && (
              <p className="rounded-2xl border border-line bg-surface px-3 py-2 text-sm">
                <span className="text-muted">Gap from Current Form to Overall 5K PB</span>{' '}
                <strong className="tabular-nums">{formatFinishTime(Math.abs(profile.currentFormGapToOverallPbSeconds))}</strong>
                <span className="text-muted">
                  {' '}
                  ({profile.currentFormGapToOverallPbSeconds >= 0 ? 'Current Form is slower' : 'Current Form is faster'})
                </span>
              </p>
            )}
            {summary!.latest && <LastRun latest={summary!.latest} />}
            <div className="grid grid-cols-2 gap-2">
              <Stat label="Performances" value={summary!.totalPerformances} />
              <Stat label="Different events" value={summary!.uniqueEvents} />
            </div>
            <p className="text-xs text-muted">
              Overall 5K PB (any race) and parkrun PB are achievements you have recorded; Recent best is your best in the last {summary!.recentWindowDays} days.
              Current Form is different: it estimates your present 5K capability from your strongest supported recent performances, adjusted for course differences. It is not a recorded result.
            </p>
          </section>

          <section aria-labelledby="recent-performances">
            <SectionHeading>
              <span id="recent-performances">Recent performances</span>
            </SectionHeading>
            <RecentPerformances total={summary!.totalPerformances} />
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
            <p className="mt-2 text-xs text-muted">Editing preferences, challenges and tourism stats arrive with accounts.</p>
          </section>

          <ConnectParkrun />
        </>
      )}

      <Card>
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 size-5 shrink-0 text-muted" aria-hidden />
          <div className="text-sm text-muted">
            <h2 className="font-semibold text-ink">Privacy and independence</h2>
            <p className="mt-1">
              Your performances are personal and only shown to you. Location is optional and only used to find events near you. 5K Compass is an
              independent app and is not affiliated with, or endorsed by, parkrun or any event organiser.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
