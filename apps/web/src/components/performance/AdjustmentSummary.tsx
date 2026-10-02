import { formatFinishTime, type CourseAdjustment } from '@runsaturday/shared';
import { ArrowRight } from 'lucide-react';
import { formatDeltaSeconds } from '../../lib/display';
import { ConfidenceBadge } from '../ui/ConfidenceBadge';

/**
 * A course-adjusted performance: the time, where it was achieved, and its equivalent here.
 * The equivalent is a labelled point estimate (≈), never a predicted finish time.
 */
export function AdjustmentSummary({ adjustment }: { adjustment: CourseAdjustment }) {
  if (!adjustment.available || adjustment.equivalentSeconds == null) {
    return (
      <p className="rounded-2xl bg-canvas p-3 text-sm font-semibold text-muted" role="note">
        {adjustment.reason}
      </p>
    );
  }
  const fromForm = adjustment.sourceKind === 'current_form';
  const same = !fromForm && adjustment.sourceEventId === adjustment.targetEventId;
  const delta = adjustment.deltaSeconds ?? 0;
  return (
    <div className="rounded-2xl bg-canvas p-3">
      <dl className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
        <div className="min-w-0">
          <dt className="text-[11px] font-semibold tracking-wide text-muted uppercase">{fromForm ? 'Current Form' : 'Performance'}</dt>
          <dd className="text-lg font-bold tabular-nums">
            {fromForm && '≈ '}
            {formatFinishTime(adjustment.sourceSeconds)}
          </dd>
          <dd className="truncate text-xs text-subtle">{fromForm ? 'Course-adjusted estimate' : `Achieved at ${adjustment.sourceEventName}`}</dd>
        </div>
        <ArrowRight className="mb-5 size-4 text-subtle" aria-hidden />
        <div className="min-w-0">
          <dt className="text-[11px] font-semibold tracking-wide text-muted uppercase">Equivalent here</dt>
          <dd className="text-lg font-extrabold tabular-nums">≈ {formatFinishTime(adjustment.equivalentSeconds)}</dd>
          <dd className="text-xs text-subtle">{same ? 'Same course, no adjustment' : `Course adjustment ${formatDeltaSeconds(delta)}`}</dd>
        </div>
      </dl>
      {!same && (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
          <span className="text-muted">Adjustment confidence</span>
          <ConfidenceBadge level={adjustment.confidence} compact />
        </div>
      )}
    </div>
  );
}
