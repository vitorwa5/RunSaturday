/** Internal analytics results → API transport shapes (no bootstrap internals exposed). */
import type { CourseSpeedBreakdown, PbBreakdown } from '@runsaturday/shared';
import type { CourseFactorResult } from './courseSpeed';
import type { PbResult } from './pbScore';

export function toCourseSpeedBreakdown(f: CourseFactorResult): CourseSpeedBreakdown {
  return {
    metric: 'course_speed',
    version: f.version,
    asOfDate: f.asOfDate,
    windowDays: f.windowDays,
    factor: f.factor,
    matchedRunners: f.matchedRunners,
    comparisons: f.comparisons,
    connectedEvents: f.connectedEvents,
    medianGapDays: f.medianGapDays,
    dispersion: f.dispersion,
    bootstrapHalfWidth: f.bootstrapHalfWidth,
    latestComparison: f.latestComparison,
    confidence: f.confidence,
    limitedReason: f.limitedReason,
  };
}

export function toPbBreakdown(p: PbResult): PbBreakdown {
  return {
    metric: 'pb',
    version: p.version,
    asOfDate: p.asOfDate,
    value: p.value,
    cohortSize: p.cohortSize,
    components: p.components,
    confidence: p.confidence,
    limitedReason: p.limitedReason,
  };
}
