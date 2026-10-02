/**
 * Course-adjusted performance (Course Speed Factor V1). Pure.
 *
 *   neutral    = source time ÷ f_source
 *   equivalent = neutral × f_target          (rounded to a whole second)
 *
 * The equivalent is a historical course conversion: what the same performance has typically
 * corresponded to at the target course. It is a point estimate, never a predicted finish time.
 * Adjustment is only offered when both factors are at least Medium confidence; there is no
 * elevation-based fallback.
 */
import type { ConfidenceLevel, CourseAdjustment } from '@runsaturday/shared';
import { ratioInterval, type CourseFactorResult } from '../analytics/courseSpeed';

export const ADJUSTMENT_UNAVAILABLE = 'Course adjustment unavailable — limited matched-runner data';

const RANK: Record<ConfidenceLevel, number> = { insufficient: 0, low: 1, medium: 2, high: 3 };
const lower = (a: ConfidenceLevel, b: ConfidenceLevel) => (RANK[a] <= RANK[b] ? a : b);

/** A factor reliable enough to adjust times with: fitted, and at least Medium confidence. */
export function isReliableFactor(f: CourseFactorResult | null | undefined): f is CourseFactorResult & { factor: number } {
  return f != null && f.factor != null && RANK[f.confidence.level] >= RANK.medium;
}

export interface AdjustmentSource {
  eventId: string;
  name: string;
  seconds: number;
}

export function adjustPerformance(
  source: AdjustmentSource,
  sourceFactor: CourseFactorResult | null | undefined,
  target: { eventId: string },
  targetFactor: CourseFactorResult | null | undefined,
): CourseAdjustment {
  const base = {
    sourceEventId: source.eventId,
    sourceEventName: source.name,
    sourceSeconds: source.seconds,
    targetEventId: target.eventId,
    sourceFactor: sourceFactor?.factor ?? null,
    targetFactor: targetFactor?.factor ?? null,
  };
  // Same course: nothing to convert.
  if (source.eventId === target.eventId) {
    return {
      ...base,
      available: true,
      reason: null,
      equivalentSeconds: source.seconds,
      deltaSeconds: 0,
      ratio: 1,
      conversionRange: null,
      confidence: sourceFactor?.confidence.level ?? 'insufficient',
    };
  }
  if (!isReliableFactor(sourceFactor) || !isReliableFactor(targetFactor)) {
    return {
      ...base,
      available: false,
      reason: ADJUSTMENT_UNAVAILABLE,
      equivalentSeconds: null,
      deltaSeconds: null,
      ratio: null,
      conversionRange: null,
      confidence: 'insufficient',
    };
  }
  const ratio = targetFactor.factor / sourceFactor.factor;
  const equivalentSeconds = Math.round((source.seconds / sourceFactor.factor) * targetFactor.factor);
  // Runner-cluster bootstrap of the same fit: course-comparison uncertainty only.
  const interval = ratioInterval(sourceFactor, targetFactor);
  return {
    ...base,
    available: true,
    reason: null,
    equivalentSeconds,
    deltaSeconds: equivalentSeconds - source.seconds,
    ratio,
    conversionRange: interval
      ? { lowSeconds: Math.round(source.seconds * interval.low), highSeconds: Math.round(source.seconds * interval.high), replicates: interval.replicates }
      : null,
    confidence: lower(sourceFactor.confidence.level, targetFactor.confidence.level),
  };
}
