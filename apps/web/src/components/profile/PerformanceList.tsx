import { formatDateWithYear, formatFinishTime, type UserPerformance } from '@runsaturday/shared';
import { ChevronRight, Pencil } from 'lucide-react';
import { Link } from 'react-router';
import { PERFORMANCE_SOURCE_LABEL, PERFORMANCE_TYPE_LABEL } from '../../lib/display';

/**
 * A user's performances: "Riverside 5K · 19:35 · 26 Sep 2026". A row at a known event opens it;
 * a race at a course 5K Compass does not model has no event page. Manual entries get an edit link.
 */
function PerformanceText({ p }: { p: UserPerformance }) {
  return (
    <div className="min-w-0 flex-1">
      <p className="truncate text-sm font-semibold">
        {p.eventName} · <span className="tabular-nums">{formatFinishTime(p.finishTimeSeconds)}</span>
      </p>
      <p className="text-xs text-muted">
        {formatDateWithYear(p.date)} · {p.performanceType !== 'parkrun' && `${PERFORMANCE_TYPE_LABEL[p.performanceType]} · `}
        {PERFORMANCE_SOURCE_LABEL[p.source]}
        {p.verified && ' · verified'}
      </p>
    </div>
  );
}

export function PerformanceList({ performances, label }: { performances: UserPerformance[]; label: string }) {
  return (
    <ul aria-label={label} className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
      {performances.map((p) => (
        <li key={p.id} className="flex items-stretch">
          {p.eventId != null ? (
            <Link to={`/event/${p.eventId}`} className="flex min-h-14 min-w-0 flex-1 items-center gap-2 px-3 py-2 hover:bg-zinc-50">
              <PerformanceText p={p} />
              <ChevronRight className="size-4 shrink-0 text-subtle" aria-hidden />
            </Link>
          ) : (
            <div className="flex min-h-14 min-w-0 flex-1 items-center gap-2 px-3 py-2">
              <PerformanceText p={p} />
            </div>
          )}
          {p.editable && (
            <Link
              to={`/profile/performances/${p.id}/edit`}
              aria-label={`Edit ${p.eventName}, ${formatDateWithYear(p.date)}`}
              className="inline-flex w-12 shrink-0 items-center justify-center border-l border-line text-muted hover:bg-zinc-50 hover:text-ink"
            >
              <Pencil className="size-4" aria-hidden />
            </Link>
          )}
        </li>
      ))}
    </ul>
  );
}
