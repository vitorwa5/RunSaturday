import { formatDateWithYear } from '@runsaturday/shared';
import { Flag } from 'lucide-react';
import { Link } from 'react-router';
import { useEventVisits } from '../../hooks/queries';
import { VisitTag } from './VisitTag';

/** Low-key Explore context on the Event page: visits here and any challenge item it would complete. */
export function EventExploreContext({ eventId }: { eventId: string }) {
  const { data } = useEventVisits(eventId);
  if (!data) return null;
  return (
    <section aria-label="Your visits" className="space-y-1.5 text-xs text-muted">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <VisitTag visited={data.visited} />
        {data.visited && (
          <>
            <span>
              Visited <strong className="text-ink tabular-nums">{data.visitCount}</strong> {data.visitCount === 1 ? 'time' : 'times'}
            </span>
            <span>First visit {formatDateWithYear(data.firstVisit!)}</span>
            {data.visitCount > 1 && <span>Latest visit {formatDateWithYear(data.latestVisit!)}</span>}
          </>
        )}
      </div>
      {data.helpsWith.length > 0 && (
        <p className="flex flex-wrap items-center gap-x-1.5">
          <Flag className="size-3.5 text-brand-700" aria-hidden />
          <span>Helps with:</span>
          {data.helpsWith.map((h, i) => (
            <Link key={`${h.challengeId}:${h.itemKey}`} to={`/challenges/${h.challengeId}`} className="font-semibold text-brand-700">
              {h.challengeName.replace(/ Challenge$/, '')} — {h.itemLabel}
              {i < data.helpsWith.length - 1 ? ',' : ''}
            </Link>
          ))}
        </p>
      )}
    </section>
  );
}
