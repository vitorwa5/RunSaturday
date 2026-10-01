/**
 * HISTORICAL PLACEMENT ENGINE V1 (pure, deterministic).
 *
 * For a target time T and each usable historical occurrence:
 *   fasterCount = Result rows with finishTimeSeconds <  T
 *   equalCount  = Result rows with finishTimeSeconds == T
 *   best  placing = fasterCount + 1
 *   worst placing = fasterCount + equalCount + 1
 * Results are recorded to the second, so when others share the target time the runner's
 * exact placing among them is unknowable; it is reported as a range (best === worst when
 * equalCount is 0). The hypothetical runner is never counted as one of the equal results.
 *
 * TARGETS (Top 3/5/10, Top 10%/25%) use a CONSERVATIVE rule: an occurrence counts only when
 * the WORST placing reaches the target, i.e. whichever way the tie is ordered. A tie that
 * straddles the boundary does not count.
 *
 * This describes history ("historically, this time would have placed…"). It makes no claim
 * about who will attend a future event.
 */
import type {
  HistoricalFrequency,
  HistoricalPlacement,
  OccurrenceStatus,
  PlacementStats,
  PlacementTargetId,
} from '@runsaturday/shared';
import { PLACEMENT_TARGETS } from '@runsaturday/shared';

/** Per-occurrence counts supplied by the data layer (no individual results needed). */
export interface PlacementOccurrenceInput {
  eventId: string;
  date: string;
  status: OccurrenceStatus;
  dataQuality: 'valid' | 'partial' | 'unvalidated' | 'rejected';
  /** Cached summary value; must agree with resultCount for the occurrence to be used. */
  participantCount: number | null;
  /** Result rows stored for the occurrence. */
  resultCount: number;
  /** Result rows strictly faster than the target time. */
  fasterCount: number;
  /** Result rows with exactly the target time. */
  equalCount: number;
}

export type Exclusion = 'cancelled' | 'insufficient_data' | null;

/**
 * Why an occurrence cannot be used, or null when it can. Only completed, validated
 * occurrences whose stored results are complete (row count matches the participant
 * count) are used, so partial imports never distort placements.
 */
export function exclusionReason(o: PlacementOccurrenceInput): Exclusion {
  if (o.status === 'cancelled') return 'cancelled';
  if (o.status !== 'completed' || o.dataQuality !== 'valid') return 'insufficient_data';
  if (o.resultCount === 0) return 'insufficient_data';
  if (o.participantCount != null && o.participantCount !== o.resultCount) return 'insufficient_data';
  if (o.fasterCount < 0 || o.equalCount < 0 || o.fasterCount + o.equalCount > o.resultCount) return 'insufficient_data';
  return null;
}

export interface PlacementSeries {
  /** Most recent first. */
  placements: HistoricalPlacement[];
  excluded: { cancelled: number; insufficientData: number };
}

export function historicalPlacements(occurrences: readonly PlacementOccurrenceInput[]): PlacementSeries {
  const excluded = { cancelled: 0, insufficientData: 0 };
  const placements: HistoricalPlacement[] = [];
  for (const o of occurrences) {
    const reason = exclusionReason(o);
    if (reason === 'cancelled') excluded.cancelled++;
    else if (reason === 'insufficient_data') excluded.insufficientData++;
    else
      placements.push({
        date: o.date,
        best: o.fasterCount + 1,
        worst: o.fasterCount + o.equalCount + 1,
        fieldSize: o.resultCount,
      });
  }
  placements.sort((a, b) => b.date.localeCompare(a.date));
  return { placements, excluded };
}

/**
 * Highest placing that counts as being within `fraction` of the field. The field includes
 * the hypothetical runner (fieldSize + 1); the winner always qualifies.
 */
export function percentThreshold(fieldSize: number, fraction: number): number {
  return Math.max(1, Math.floor(fraction * (fieldSize + 1)));
}

/** Conservative: true only when the worst-case placing reaches the target. */
export function meetsTarget(p: HistoricalPlacement, target: PlacementTargetId): boolean {
  const def = PLACEMENT_TARGETS.find((t) => t.id === target)!;
  const limit = def.kind === 'position' ? def.value : percentThreshold(p.fieldSize, def.value);
  return p.worst <= limit;
}

function frequency(placements: readonly HistoricalPlacement[], test: (p: HistoricalPlacement) => boolean): HistoricalFrequency {
  return { count: placements.filter(test).length, of: placements.length };
}

/** Nearest-rank percentile (p in (0, 1]) of sorted values. */
function nearestRank(sorted: readonly number[], p: number): number {
  return sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)]!;
}

/** Median rounded half up. */
function roundedMedian(sorted: readonly number[]): number {
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
  return Math.floor(median + 0.5);
}

/** Summary statistics, or null when there are no usable placements. */
export function summarizePlacements(placements: readonly HistoricalPlacement[]): PlacementStats | null {
  if (placements.length === 0) return null;
  const bests = placements.map((p) => p.best).sort((a, b) => a - b);
  const worsts = placements.map((p) => p.worst).sort((a, b) => a - b);

  return {
    medianPlacement: { low: roundedMedian(bests), high: roundedMedian(worsts) },
    bestPlacement: bests[0]!,
    worstPlacement: worsts.at(-1)!,
    typicalRange: { low: nearestRank(bests, 0.25), high: nearestRank(worsts, 0.75) },
    frequencies: {
      first: frequency(placements, (p) => p.worst === 1),
      top3: frequency(placements, (p) => meetsTarget(p, 'podium')),
      top5: frequency(placements, (p) => meetsTarget(p, 'top5')),
      top10: frequency(placements, (p) => meetsTarget(p, 'top10')),
      top10Percent: frequency(placements, (p) => meetsTarget(p, 'top10pct')),
      top25Percent: frequency(placements, (p) => meetsTarget(p, 'top25pct')),
    },
  };
}

export function targetFrequency(placements: readonly HistoricalPlacement[], target: PlacementTargetId): HistoricalFrequency {
  return frequency(placements, (p) => meetsTarget(p, target));
}
