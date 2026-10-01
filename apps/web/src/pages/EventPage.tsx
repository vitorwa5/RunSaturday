import { formatFinishTime, formatShortDate, type EventDetail } from '@runsaturday/shared';
import { CalendarClock, CircleCheck, Heart, LineChart, MapPin, Route, SearchX, Target } from 'lucide-react';
import { useState } from 'react';
import { useParams } from 'react-router';
import { AlertBanner } from '../components/ui/AlertBanner';
import { ButtonLink } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { ConfidenceBadge } from '../components/ui/ConfidenceBadge';
import { DefinitionList } from '../components/ui/DefinitionList';
import { DemoBadge } from '../components/ui/DemoBadge';
import { EmptyState } from '../components/ui/EmptyState';
import { ErrorState } from '../components/ui/ErrorState';
import { LoadingState } from '../components/ui/LoadingState';
import { MetricCard } from '../components/ui/MetricCard';
import { PageHeader } from '../components/ui/PageHeader';
import { Tabs, type TabDef } from '../components/ui/Tabs';
import { TravelBadge } from '../components/ui/TravelBadge';
import { ApiError } from '../api/client';
import { useEvent } from '../hooks/queries';
import {
  competitionBand,
  CONFIDENCE_DISPLAY,
  COURSE_TYPE_LABEL,
  difficultyBand,
  FACILITY_LABEL,
  formatCount,
  formatDifficulty,
  formatMeters,
  formatScore,
  opportunityBand,
  SURFACE_LABEL,
} from '../lib/display';

type TabId = 'overview' | 'results' | 'course' | 'info';
const TABS: TabDef<TabId>[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'results', label: 'Results' },
  { id: 'course', label: 'Course' },
  { id: 'info', label: 'Info' },
];

const time = (s: number | null) => (s == null ? '—' : formatFinishTime(s));

function SampleNote({ event }: { event: EventDetail }) {
  return (
    <p className="text-xs text-muted">
      Based on {event.occurrencesLast90Days} {event.occurrencesLast90Days === 1 ? 'event' : 'events'} during the last 90 days.
    </p>
  );
}

function OverviewTab({ event }: { event: EventDetail }) {
  const s = event.scores;
  return (
    <div className="space-y-3">
      <DefinitionList
        items={[
          { label: 'Course type', value: COURSE_TYPE_LABEL[event.courseType] },
          { label: 'Surface', value: SURFACE_LABEL[event.surface] },
          { label: 'Laps', value: event.laps ?? 'Unknown' },
          { label: 'Elevation', value: formatMeters(event.elevationM) },
          { label: 'Average participants', value: formatCount(event.averageParticipants) },
          { label: 'PB Score', value: `${formatScore(s?.pbScore)} / 100` },
          { label: 'Difficulty', value: `${formatDifficulty(s?.difficultyScore)} / 10` },
          { label: 'Competition', value: `${formatScore(s?.competitionScore)} / 100` },
          { label: 'Data confidence', value: s ? CONFIDENCE_DISPLAY[s.pbConfidence].label : 'Limited data' },
          { label: 'Score version', value: s?.calculationVersion ?? '—' },
          { label: 'Last update', value: new Date(event.lastUpdated).toLocaleDateString('en-GB') },
        ]}
      />
      <SampleNote event={event} />
      <AlertBanner tone="neutral" title="Median placing times arrive with the Competition Score">
        Median winner, 3rd, 5th and 10th place times will be calculated server-side in a later phase.
      </AlertBanner>
    </div>
  );
}

function ResultsTab({ event }: { event: EventDetail }) {
  if (event.recentOccurrences.length === 0) {
    return (
      <EmptyState
        icon={LineChart}
        title="No results imported yet"
        description="Update event data to see historical results and generate scores."
      />
    );
  }
  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-2xl border border-line bg-surface">
        <table className="w-full text-sm">
          <caption className="sr-only">Recent results, most recent first</caption>
          <thead className="bg-canvas text-left text-xs text-muted">
            <tr>
              <th scope="col" className="px-3 py-2 font-semibold">Date</th>
              <th scope="col" className="px-3 py-2 text-right font-semibold">Runners</th>
              <th scope="col" className="px-3 py-2 text-right font-semibold">1st</th>
              <th scope="col" className="px-3 py-2 text-right font-semibold">10th</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line tabular-nums">
            {event.recentOccurrences.map((o) => (
              <tr key={o.date}>
                <th scope="row" className="px-3 py-2 text-left font-medium">{formatShortDate(o.date)}</th>
                {o.status === 'cancelled' ? (
                  <td colSpan={3} className="px-3 py-2 text-right font-semibold text-problem">
                    Cancelled
                  </td>
                ) : (
                  <>
                    <td className="px-3 py-2 text-right">{formatCount(o.participantCount)}</td>
                    <td className="px-3 py-2 text-right">{time(o.winnerTimeSeconds)}</td>
                    <td className="px-3 py-2 text-right">{time(o.tenthTimeSeconds)}</td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted">
        Showing the {event.recentOccurrences.length} most recent events. Charts and 30/60/90/365-day ranges arrive in a later phase.
      </p>
    </div>
  );
}

function CourseTab({ event }: { event: EventDetail }) {
  return (
    <div className="space-y-3">
      <DefinitionList
        items={[
          { label: 'Course type', value: COURSE_TYPE_LABEL[event.courseType] },
          { label: 'Laps', value: event.laps ?? 'Unknown' },
          { label: 'Surface', value: SURFACE_LABEL[event.surface] },
          { label: 'Elevation', value: formatMeters(event.elevationM) },
          { label: 'Estimated course adjustment', value: 'Not yet calculated' },
        ]}
      />
      <EmptyState
        icon={Route}
        title="Course map and elevation profile coming later"
        description="Course details will be added once course data is available. We will not guess them."
      />
    </div>
  );
}

function InfoTab({ event }: { event: EventDetail }) {
  const f = event.facilities;
  const latest = event.recentOccurrences[0];
  return (
    <div className="space-y-3">
      <DefinitionList
        items={[
          { label: 'Start point', value: event.startLocationText ?? 'Unknown' },
          { label: 'Start time', value: event.startTime ?? 'Unknown' },
          { label: 'Parking', value: FACILITY_LABEL[f.parking] },
          { label: 'Toilets', value: FACILITY_LABEL[f.toilets] },
          { label: 'Cafe', value: FACILITY_LABEL[f.cafe] },
          { label: 'Dogs', value: FACILITY_LABEL[f.dogs] },
          { label: 'Buggies', value: FACILITY_LABEL[f.buggies] },
          { label: 'Accessibility', value: FACILITY_LABEL[f.accessibility] },
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
      <p className="text-xs text-muted">“Unknown” means we do not have this information yet. Always check the official event page before travelling.</p>
    </div>
  );
}

export function EventPage() {
  const { id = '' } = useParams();
  const { data: event, isPending, isError, error, refetch } = useEvent(id);
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

  const s = event.scores;
  const latest = event.recentOccurrences[0];

  return (
    <div className="space-y-5">
      <PageHeader
        back
        title={event.name}
        subtitle={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {event.town && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="size-3.5" aria-hidden />
                {event.town}
              </span>
            )}
            <TravelBadge travel={event.travel} />
          </span>
        }
        actions={
          event.favourite ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-800">
              <Heart className="size-3.5 fill-brand-600 text-brand-600" aria-hidden />
              Saved
            </span>
          ) : null
        }
      />

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ${
            event.active ? 'bg-positive-bg text-positive' : 'bg-problem-bg text-problem'
          }`}
        >
          <CircleCheck className="size-3.5" aria-hidden />
          {event.active ? 'ACTIVE' : 'INACTIVE'}
        </span>
        {event.source === 'demo' && <DemoBadge />}
        <span className="inline-flex items-center gap-1 text-muted">
          <CalendarClock className="size-4" aria-hidden />
          Saturday {event.startTime ?? ''}
          {event.startLocationText && ` · ${event.startLocationText}`}
        </span>
      </div>

      {latest?.status === 'cancelled' && (
        <AlertBanner tone="problem" title={`Cancelled on ${formatShortDate(latest.date)}`}>
          The most recent event did not take place. Check the official page before travelling.
        </AlertBanner>
      )}

      <section aria-label="Key metrics" className="grid grid-cols-2 gap-2">
        <MetricCard label="PB Score" value={formatScore(s?.pbScore)} suffix="/ 100" band={opportunityBand(s?.pbScore)} />
        <MetricCard label="Difficulty" value={formatDifficulty(s?.difficultyScore)} suffix="/ 10" band={difficultyBand(s?.difficultyScore)} />
        <MetricCard label="Competition" value={formatScore(s?.competitionScore)} suffix="/ 100" band={competitionBand(s?.competitionScore)} />
        <MetricCard label="Avg participants" value={formatCount(event.averageParticipants)} />
        <MetricCard label="Elevation" value={event.elevationM ?? '—'} suffix={event.elevationM != null ? 'm' : undefined} />
        <div className="rounded-2xl border border-line bg-surface p-3">
          <p className="text-[11px] font-semibold tracking-wide text-muted uppercase">Data confidence</p>
          <div className="mt-2">
            <ConfidenceBadge level={s?.pbConfidence ?? 'insufficient'} />
          </div>
          <p className="mt-1.5 text-xs text-subtle">
            {s ? `${s.sampleSize} events / ${s.windowDays} days` : 'No scores yet'}
          </p>
        </div>
      </section>

      <Card>
        <div className="flex items-start gap-3">
          <Target className="mt-0.5 size-5 shrink-0 text-brand-700" aria-hidden />
          <div>
            <h2 className="font-semibold">Your personal forecast</h2>
            <p className="mt-1 text-sm text-muted">
              Expected time and how that time would historically have placed here arrive with “Where Could I Place?”.
            </p>
          </div>
        </div>
      </Card>

      <Tabs tabs={TABS} value={tab} onChange={setTab} label="Event details">
        {tab === 'overview' && <OverviewTab event={event} />}
        {tab === 'results' && <ResultsTab event={event} />}
        {tab === 'course' && <CourseTab event={event} />}
        {tab === 'info' && <InfoTab event={event} />}
      </Tabs>
    </div>
  );
}
