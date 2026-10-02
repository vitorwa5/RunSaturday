import type { Recommendation } from '@runsaturday/shared';
import { LIMITED_MATCHED, PB_UNAVAILABLE, rankedByBand } from '../../lib/display';
import { TONE_CLASSES } from '../ui/tone';

/** The metric a recommendation was ranked by, shown prominently with its scale and band. */
export function RankedMetric({ rankedBy, size = 'lg' }: { rankedBy: Recommendation['rankedBy']; size?: 'lg' | 'md' }) {
  const band = rankedByBand(rankedBy);
  const value = rankedBy.value == null ? '—' : Math.round(rankedBy.value);
  if (rankedBy.key === 'pb_score' && rankedBy.value == null) {
    return (
      <div>
        <p className="text-xs font-semibold tracking-wide text-muted uppercase">{PB_UNAVAILABLE}</p>
        <p className="mt-1 text-sm font-semibold text-subtle">{LIMITED_MATCHED}</p>
      </div>
    );
  }
  const hint = rankedBy.direction === 'lower_is_better' && rankedBy.key === 'competition_score' ? 'lower is better for placing' : null;
  return (
    <div>
      <p className="text-xs font-semibold tracking-wide text-muted uppercase">{rankedBy.label}</p>
      <p className={`flex items-baseline gap-1.5 ${size === 'lg' ? 'mt-0.5' : 'mt-1'}`}>
        <span className={`font-extrabold tracking-tight tabular-nums ${size === 'lg' ? 'text-5xl' : 'text-[1.75rem] leading-none'}`}>{value}</span>
        {rankedBy.outOf && <span className="text-base font-semibold text-subtle">/ {rankedBy.outOf}</span>}
        {rankedBy.unit && <span className="text-base font-semibold text-subtle">{rankedBy.unit}</span>}
        {band && (
          <span className={`ml-1 self-center rounded-full px-2 py-0.5 text-xs font-bold ${TONE_CLASSES[band.tone]}`}>{band.label}</span>
        )}
      </p>
      {size === 'lg' && rankedBy.outOf && rankedBy.value != null && (
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-zinc-100" aria-hidden>
          <div className="h-full rounded-full bg-brand-600" style={{ width: `${Math.min(100, (rankedBy.value / rankedBy.outOf) * 100)}%` }} />
        </div>
      )}
      {hint && size === 'lg' && <p className="mt-1 text-xs text-subtle">{hint}</p>}
    </div>
  );
}
