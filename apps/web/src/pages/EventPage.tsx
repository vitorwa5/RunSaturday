import {
  DEFAULT_HISTORY_WINDOW,
  formatShortDate,
  HISTORY_WINDOWS,
  type EventDetail,
  type EventHistoryResponse,
  type HistoryWindowId,
} from '@runsaturday/shared';
import { CalendarClock, Car, Heart, LineChart, MapPin, Mountain, Route, SearchX, Timer } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useParams } from 'react-router';
import { ApiError } from '../api/client';
import { EventHeroMetrics } from '../components/events/EventHeroMetrics';
import { FacilityList } from '../components/events/FacilityList';
import { CoverageNote, HistoricalTimes, OccurrenceTable, ParticipantsChart, SampleNote } from '../components/events/HistoryViews';
import { OutlookCard } from '../components/events/OutlookCard';
import { ScoreExplainer } from '../components/events/ScoreExplainer';
import { AlertBanner } from '../components/ui/AlertBanner';
import { ButtonLink } from '../components/ui/Button';
import { ChoiceChips } from '../components/ui/ChoiceChips';
import { DefinitionList } from '../components/ui/DefinitionList';
import { DemoBadge } from '../components/ui/DemoBadge';
import { EmptyState } from '../components/ui/EmptyState';
import { ErrorState } from '../components/ui/ErrorState';
import { LoadingState, Skeleton } from '../components/ui/LoadingState';
import { PageHeader, SectionHeading } from '../components/ui/PageHeader';
import { ReservedFeature } from '../components/ui/ReservedFeature';
import { Tabs, type TabDef } from '../components/ui/Tabs';
import { useEvent, useEventHistory, useProfile } from '../hooks/queries';
import { COURSE_TYPE_LABEL, factorPhrase, formatCount, formatFactor, formatMeters, LIMITED_MATCHED, SURFACE_LABEL } from '../lib/display';

type TabId = 'overview' | 'results' | 'course' | 'info';
const TABS: TabDef<TabId>[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'results', label: 'Results' },
  { id: 'course', label: 'Course' },
  { id: 'info', label: 'Info' },
];

const windowPhrase = (id: HistoryWindowId) =>
  id === 'all' ? 'across all stored history' : id === '365' ? 'in the last year' : `in the last ${id} days`;

function courseFacts(event: EventDetail) {
  return [
    { label: 'Course type', value: COURSE_TYPE_LABEL[event.courseType] },
    { label: 'Surface', value: SURFACE_LABEL[event.surface] },
    { label: 'Laps', value: event.laps ?? 'Unknown' },
    { label: 'Elevation', value: formatMeters(event.elevationM) },
  ];
}

function HistoryLoader({ id, window, children }: { id: string; window: HistoryWindowId; children: (history: EventHistoryResponse) => ReactNode }) {
  const { data, isPending, isError, error, refetch, isPlaceholderData } = useEventHistory(id, window);
  if (isPending) {
    return (
      <div role="status" className="space-y-2">
        <span className="sr-only">Loading history…</span>
        <Skeleton className="h-24 w-full rounded-2xl" />
        <Skeleton className="h-4 w-48" />
      </div>
    );
  }
  if (isError) return <ErrorState error={error} title="History could not be loaded" onRetry={() => refetch()} />;
  return <div className={isPlaceholderData ? 'opacity-60 transition-opacity' : 'transition-opacity'} aria-busy={isPlaceholderData}>{children(data)}</div>;
}

function OverviewTab({ event }: { event: EventDetail }) {
  return (
    <div className="space-y-6">
      <section aria-labelledby="hist-times">
        <SectionHeading>
          <span id="hist-times">Historical times</span>
        </SectionHeading>
        <HistoryLoader id={event.id} window={DEFAULT_HISTORY_WINDOW}>
          {(history) => <HistoricalTimes history={history} windowLabel={windowPhrase(DEFAULT_HISTORY_WINDOW)} />}
        </HistoryLoader>
      </section>
      <section aria-labelledby="course-summary">
        <SectionHeading>
          <span id="course-summary">Course summary</span>
        </SectionHeading>
        <DefinitionList items={[...courseFacts(event), { label: 'Average participants', value: formatCount(event.averageParticipants) }]} />
      </section>
    </div>
  );
}

function ResultsTab({ event }: { event: EventDetail }) {
  const [window, setWindow] = useState<HistoryWindowId>(DEFAULT_HISTORY_WINDOW);
  return (
    <div className="space-y-3">
      <ChoiceChips
        label="Time period"
        options={HISTORY_WINDOWS.map((w) => ({ value: w.id, label: w.label }))}
        value={window}
        onChange={setWindow}
      />
      <HistoryLoader id={event.id} window={window}>
        {(history) =>
          history.occurrences.length === 0 ? (
            <EmptyState icon={LineChart} title="No results in this period" description="Try a longer time period. Results appear here once they have been imported." />
          ) : (
            <div className="space-y-3">
              <SampleNote history={history} windowLabel={windowPhrase(window)} />
              <CoverageNote history={history} />
              <ParticipantsChart occurrences={history.occurrences} />
              <OccurrenceTable occurrences={history.occurrences} />
            </div>
          )
        }
      </HistoryLoader>
    </div>
  );
}

function CourseTab({ event }: { event: EventDetail }) {
  return (
    <div className="space-y-4">
      <DefinitionList items={courseFacts(event)} />
      <div className="space-y-2">
        <ReservedFeature icon={MapPin} title="Course map" description="The route, start and finish on a map." />
        <ReservedFeature icon={Mountain} title="Elevation profile" description="Where the climbs and descents are." />
        <div className="flex items-start gap-3 rounded-2xl border border-line bg-surface p-3">
          <Timer className="mt-0.5 size-5 text-brand-700" aria-hidden />
          <div className="text-sm">
            <p className="font-semibold">Course speed</p>
            {event.scores?.courseSpeedFactor != null ? (
              <p className="text-muted">
                Course Speed Factor <strong className="text-ink tabular-nums">{formatFactor(event.scores.courseSpeedFactor)}</strong> ·{' '}
                {factorPhrase(event.scores.courseSpeedFactor)}, from runners who also ran other events. 1.000 is the reference of the analysed course cohort,
                not a neutral course.
              </p>
            ) : (
              <p className="text-muted">Course adjustment unavailable — {LIMITED_MATCHED.toLowerCase()}.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function InfoTab({ event }: { event: EventDetail }) {
  const latest = event.recentOccurrences[0];
  return (
    <div className="space-y-4">
      <FacilityList facilities={event.facilities} />
      <DefinitionList
        items={[
          { label: 'Start point', value: event.startLocationText ?? 'Unknown' },
          { label: 'Start time', value: event.startTime ?? 'Unknown' },
          {
            label: 'Latest event',
            value: latest ? `${formatShortDate(latest.date)} · ${latest.status === 'cancelled' ? 'Cancelled' : 'Took place'}` : 'Unknown',
          },
          {
            label: 'Official page',
            value: event.officialUrl ? (
              <a href={event.officialUrl} target="_blank" rel="noreferrer" className="text-brand-700 underline">
                Open
              </a>
            ) : (
              'Unknown'
            ),
          },
        ]}
      />
      <p className="text-xs text-muted">“Unknown” means we don't have this information yet. Always check the official event page before travelling.</p>
    </div>
  );
}

function FavouriteButton({ saved }: { saved: boolean }) {
  return (
    <button
      type="button"
      disabled
      aria-pressed={saved}
      title="Saving events arrives with accounts"
      className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-line bg-surface px-3 text-sm font-semibold text-ink disabled:cursor-not-allowed"
    >
      <Heart className={`size-4 ${saved ? 'fill-brand-600 text-brand-600' : 'text-subtle'}`} aria-hidden />
      {saved ? 'Saved' : 'Save'}
      <span className="sr-only"> (changing saved events is coming later)</span>
    </button>
  );
}

export function EventPage() {
  const { id = '' } = useParams();
  const { data: event, isPending, isError, error, refetch } = useEvent(id);
  const { data: profile } = useProfile();
  const [tab, setTab] = useState<TabId>('overview');

  if (isPending) {
    return (
      <div className="space-y-4 pt-4">
        <LoadingState variant="card" label="Loading event" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="pt-4">
        {error instanceof ApiError && error.status === 404 ? (
          <EmptyState
            icon={SearchX}
            title="Event not found"
            description="This event may have been renamed or removed."
            action={<ButtonLink to="/explore">Search events</ButtonLink>}
          />
        ) : (
          <ErrorState error={error} title="Event could not be loaded" onRetry={() => refetch()} />
        )}
      </div>
    );
  }

  const latest = event.recentOccurrences[0];

  return (
    <div className="space-y-5">
      <PageHeader back title={event.name} actions={<FavouriteButton saved={event.favourite === true} />} />

      <div className="-mt-3 space-y-2 text-sm">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          {event.town && (
            <span className="inline-flex items-center gap-1 text-muted">
              <MapPin className="size-4" aria-hidden />
              {event.town}
            </span>
          )}
          {event.travel && (
            <span className="inline-flex items-center gap-1 text-muted" title={`Estimated from straight-line distance (${event.travel.distanceKm} km)`}>
              <Car className="size-4" aria-hidden />~{event.travel.minutes} min estimated travel
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold ${
              event.active ? 'bg-positive-bg text-positive' : 'bg-problem-bg text-problem'
            }`}
          >
            {event.active ? 'Active' : 'Inactive'}
          </span>
          {event.source === 'demo' && <DemoBadge />}
          {event.startTime && (
            <span className="inline-flex items-center gap-1 text-muted">
              <CalendarClock className="size-4" aria-hidden />
              Saturdays {event.startTime}
            </span>
          )}
        </div>
      </div>

      {latest?.status === 'cancelled' && (
        <AlertBanner tone="problem" title={`Cancelled on ${formatShortDate(latest.date)}`}>
          The most recent event did not take place. Check the official page before travelling.
        </AlertBanner>
      )}

      <EventHeroMetrics event={event} />
      <ScoreExplainer eventId={event.id} />

      <OutlookCard profile={profile} eventId={event.id} />

      <Tabs tabs={TABS} value={tab} onChange={setTab} label="Event details">
        {tab === 'overview' && <OverviewTab event={event} />}
        {tab === 'results' && <ResultsTab event={event} />}
        {tab === 'course' && <CourseTab event={event} />}
        {tab === 'info' && <InfoTab event={event} />}
      </Tabs>

      <p className="flex items-center gap-1.5 text-xs text-subtle">
        <Route className="size-3.5" aria-hidden />
        {event.scores
          ? `Course speed ${event.scores.versions.courseSpeed ?? 'n/a'} · Competition ${event.scores.versions.competition ?? 'n/a'} · Difficulty ${event.scores.versions.difficulty ?? 'n/a'} · PB Score ${event.scores.versions.pb}`
          : 'Scores not yet calculated.'}
      </p>
    </div>
  );
}
