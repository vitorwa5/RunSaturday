/**
 * Confidence from sample size (v1). Used for calculated historical metrics such as
 * placement. It deliberately only looks at how many usable events support a figure;
 * recency, completeness and consistency inputs can be added later without changing callers.
 */
import type { ConfidenceLevel } from '@runsaturday/shared';

export const CONFIDENCE_THRESHOLDS = { high: 10, medium: 6, low: 3 } as const;

export function confidenceFromSampleSize(sampleSize: number): ConfidenceLevel {
  if (sampleSize >= CONFIDENCE_THRESHOLDS.high) return 'high';
  if (sampleSize >= CONFIDENCE_THRESHOLDS.medium) return 'medium';
  if (sampleSize >= CONFIDENCE_THRESHOLDS.low) return 'low';
  return 'insufficient';
}
