/**
 * CONFIDENCE V2: confidence in the DATA behind a calculated metric. It is never a
 * probability of a future result.
 *
 *   score = 0.40 × amount + 0.25 × recency + 0.20 × completeness + 0.15 × stability
 *
 * Each factor is 0–100:
 *   amount        usable observations, saturating: min(n, AMOUNT_FULL_AT) / AMOUNT_FULL_AT.
 *                 More events help, but cannot push the factor past 100.
 *   recency       days since the most recent usable observation: 100 up to RECENCY_FULL_DAYS,
 *                 falling linearly to 0 at RECENCY_ZERO_DAYS.
 *   completeness  usable observations ÷ eligible (non-cancelled) occurrences in the window.
 *                 Cancelled dates are not "missing data"; partial or unvalidated results are.
 *   stability     robust spread of the observations: MAD ÷ max(median, floor), mapped linearly
 *                 from 100 (no spread) to 0 at the metric's tolerance. Median and MAD ignore
 *                 a single extreme Saturday. Needs at least 3 observations (else 0).
 *
 * Level: High ≥ 75, Medium ≥ 55, Low ≥ 35, otherwise Limited data. Fewer than
 * MIN_OBSERVATIONS usable observations is always Limited data.
 */
import type { ConfidenceAssessment, ConfidenceFactor, ConfidenceLevel } from '@runsaturday/shared';
import { addDays } from '@runsaturday/shared';
import { median } from './statistics';

export const CONFIDENCE_V2 = {
  weights: { amount: 0.4, recency: 0.25, completeness: 0.2, stability: 0.15 },
  AMOUNT_FULL_AT: 12,
  RECENCY_FULL_DAYS: 7,
  RECENCY_ZERO_DAYS: 90,
  MIN_OBSERVATIONS: 3,
  levels: { high: 75, medium: 55, low: 35 },
} as const;

/** How stability is judged for a given kind of observation. */
export interface StabilityScale {
  /** Robust relative spread at which stability reaches 0. */
  tolerance: number;
  /** Lower bound for the denominator, so small medians (e.g. 2nd place) are not over-penalised. */
  floor: number;
  /** Describes the observation, e.g. "top-10% cutoff times". */
  describes: string;
}

export const STABILITY_SCALES = {
  /** Finish times: a 10% robust spread is very unstable for an event's cutoff times. */
  finishTimes: { tolerance: 0.1, floor: 1, describes: 'top-10% cutoff times' },
  /** Historical placings: spread relative to the median placing, floored at 10 places. */
  placings: { tolerance: 0.5, floor: 10, describes: 'historical placings' },
} as const satisfies Record<string, StabilityScale>;

export interface ConfidenceInput {
  /** Usable observations (date + numeric value) in the window. */
  observations: { date: string; value: number }[];
  /** Non-cancelled occurrences in the window (usable or not). */
  eligibleCount: number;
  /** Analysis date. */
  asOfDate: string;
  stability: StabilityScale;
}

const clamp = (v: number) => Math.min(100, Math.max(0, v));

export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / 86_400_000);
}

export function levelFromScore(score: number, observations: number): ConfidenceLevel {
  if (observations < CONFIDENCE_V2.MIN_OBSERVATIONS) return 'insufficient';
  if (score >= CONFIDENCE_V2.levels.high) return 'high';
  if (score >= CONFIDENCE_V2.levels.medium) return 'medium';
  if (score >= CONFIDENCE_V2.levels.low) return 'low';
  return 'insufficient';
}

/** Median absolute deviation from the median; null when empty. */
export function medianAbsoluteDeviation(values: readonly number[]): number | null {
  const m = median(values);
  if (m == null) return null;
  return median(values.map((v) => Math.abs(v - m)));
}

export function assessConfidence(input: ConfidenceInput): ConfidenceAssessment {
  const { weights, AMOUNT_FULL_AT, RECENCY_FULL_DAYS, RECENCY_ZERO_DAYS, MIN_OBSERVATIONS } = CONFIDENCE_V2;
  const n = input.observations.length;
  const values = input.observations.map((o) => o.value);

  const amount = clamp((100 * Math.min(n, AMOUNT_FULL_AT)) / AMOUNT_FULL_AT);

  const latest = input.observations.reduce<string | null>((acc, o) => (acc == null || o.date > acc ? o.date : acc), null);
  const age = latest == null ? null : daysBetween(latest, input.asOfDate);
  const recency =
    age == null ? 0 : clamp(100 * (1 - Math.max(0, age - RECENCY_FULL_DAYS) / (RECENCY_ZERO_DAYS - RECENCY_FULL_DAYS)));

  const completeness = input.eligibleCount > 0 ? clamp((100 * n) / input.eligibleCount) : 0;

  let stability = 0;
  let spreadDetail = 'Needs at least 3 usable events';
  if (n >= MIN_OBSERVATIONS) {
    const m = median(values)!;
    const mad = medianAbsoluteDeviation(values)!;
    const relative = mad / Math.max(Math.abs(m), input.stability.floor);
    stability = clamp(100 * (1 - relative / input.stability.tolerance));
    spreadDetail = `Typical variation ${(relative * 100).toFixed(1)}% in ${input.stability.describes}`;
  }

  const factors: ConfidenceFactor[] = [
    { key: 'amount', label: 'Amount of data', weight: weights.amount, value: Math.round(amount), detail: `${n} usable ${n === 1 ? 'event' : 'events'} (full marks at ${AMOUNT_FULL_AT})` },
    {
      key: 'recency',
      label: 'Recency',
      weight: weights.recency,
      value: Math.round(recency),
      detail: age == null ? 'No usable events' : age <= 0 ? 'Latest event is current' : `Latest usable event ${age} ${age === 1 ? 'day' : 'days'} before ${input.asOfDate}`,
    },
    {
      key: 'completeness',
      label: 'Completeness',
      weight: weights.completeness,
      value: Math.round(completeness),
      detail: `${n} of ${input.eligibleCount} non-cancelled events have complete, validated results`,
    },
    { key: 'stability', label: 'Stability', weight: weights.stability, value: Math.round(stability), detail: spreadDetail },
  ];

  const score = Math.round(factors.reduce((sum, f) => sum + f.value * f.weight, 0));
  return { level: levelFromScore(score, n), score, factors };
}

/** Window start for confidence inputs: (asOf - days, asOf], or null for all history. */
export function windowStart(asOfDate: string, windowDays: number | null): string | null {
  return windowDays == null || windowDays === 0 ? null : addDays(asOfDate, -windowDays + 1);
}
