import { formatDateWithYear, formatFinishTime } from '@runsaturday/shared';
import { History, Plus } from 'lucide-react';
import { Link } from 'react-router';
import { usePerformances, usePerformanceSummary } from '../../hooks/queries';

const SHOWN = 3;

/** The user's own history at this event, derived on the server. Deliberately low-key. */
export function YourHistoryHere({ eventId }: { eventId: string }) {
  const { data: summary } = usePerformanceSummary();
  const here = summary?.events.find((e) => e.eventId === eventId) ?? null;
  const { data: recent } = usePerformances({ eventId, limit: SHOWN });
  if (!summary) return null;

  return (
    <section aria-labelledby="your-history-here" className="rounded-2xl border border-line bg-surface px-4 py-3 text-sm">
      <div className="flex items-center justify-between gap-2">
        <h2 id="your-history-here" className="flex items-center gap-1.5 font-semibold">
          <History className="size-4 text-muted" aria-hidden />
          Your history here
        </h2>
        <Link to={`/profile/performances/new?event=${eventId}`} className="inline-flex min-h-9 items-center gap-1 text-xs font-semibold text-brand-700">
          <Plus className="size-3.5" aria-hidden />
          Add a run
        </Link>
      </div>
      {here ? (
        <>
          <dl className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-muted">
            <div className="flex gap-1">
              <dt className="sr-only">Runs</dt>
              <dd>
                <strong className="text-ink tabular-nums">{here.count}</strong> {here.count === 1 ? 'run' : 'runs'}
              </dd>
            </div>
            <div className="flex gap-1">
              <dt>PB</dt>
              <dd className="font-bold text-ink tabular-nums">{formatFinishTime(here.pb.finishTimeSeconds)}</dd>
            </div>
            <div className="flex gap-1">
              <dt>Latest</dt>
              <dd className="font-bold text-ink tabular-nums">{formatFinishTime(here.latest.finishTimeSeconds)}</dd>
            </div>
          </dl>
          {recent && recent.performances.length > 0 && (
            <ul aria-label="Your recent runs here" className="mt-2 space-y-0.5 text-xs text-muted">
              {recent.performances.map((p) => (
                <li key={p.id} className="flex justify-between gap-2 tabular-nums">
                  <span>{formatDateWithYear(p.date)}</span>
                  <span className="font-semibold text-ink">{formatFinishTime(p.finishTimeSeconds)}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <p className="mt-1 text-xs text-muted">You haven't recorded a run here yet.</p>
      )}
    </section>
  );
}
