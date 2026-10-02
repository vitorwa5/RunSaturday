/**
 * PB SCORE V1 (pb_v1), 0–100: how favourable this event has historically been for running a
 * fast 5K, relative to the analysed event cohort.
 *
 *   PB = 0.75 × observed course speed + 0.25 × structural suitability
 *
 *   observed course speed   cohort-relative mid-rank of the Course Speed Factor among events
 *                           with a fitted factor (lower factor = faster = higher score)
 *   structural suitability  the same mid-rank method on Difficulty V1 among those events
 *                           (structurally easier = higher score)
 *
 * Primary evidence is observed course speed from matched runners. Competition Score is NOT an
 * input (a strong field is not a fast course) and weather is not modelled. No factor → no PB
 * Score ("Limited matched-runner data"); there is no fallback to the old demo value.
 * PB confidence = the Course Speed Factor's confidence, reported separately from the score.
 * Computed from the analytics snapshot cohort, never from a user's filters.
 */
import type { ConfidenceAssessment, DifficultyBreakdown } from '@runsaturday/shared';
import { cohortStrengths } from './competition';
import type { CourseFactorResult } from './courseSpeed';
import { PB_VERSION } from './versions';

export const PB_V1 = {
  weights: { course_speed: 0.75, structural: 0.25 },
  MIN_COHORT: 3,
} as const;

export interface PbComponent {
  key: 'course_speed' | 'structural';
  label: string;
  weight: number;
  value: number | null;
  input: string;
}

export interface PbResult {
  eventId: string;
  metric: 'pb';
  version: string;
  asOfDate: string;
  value: number | null;
  cohortSize: number;
  components: PbComponent[];
  confidence: ConfidenceAssessment;
  limitedReason: string | null;
}

/** Relative to the analysed cohort only: 1.000 is the cohort's geometric mean, not a neutral course. */
export const describeFactor = (factor: number) => {
  if (Math.abs(factor - 1) < 0.0025) return `${factor.toFixed(3)} (close to the analysed course cohort reference)`;
  return `${factor.toFixed(3)} (historically ${factor < 1 ? 'faster' : 'slower'} relative to the analysed course cohort)`;
};

export function computePbScores(
  factors: readonly CourseFactorResult[],
  difficulty: ReadonlyMap<string, DifficultyBreakdown>,
  asOfDate: string,
): PbResult[] {
  const fitted = factors.filter((f) => f.factor != null && f.confidence.level !== 'insufficient');
  const cohortOk = fitted.length >= PB_V1.MIN_COHORT;
  const speed = cohortOk ? cohortStrengths(new Map(fitted.map((f) => [f.eventId, f.factor!]))) : new Map<string, number>();
  const withDifficulty = fitted.filter((f) => difficulty.get(f.eventId)?.value != null);
  const structural =
    withDifficulty.length >= PB_V1.MIN_COHORT
      ? cohortStrengths(new Map(withDifficulty.map((f) => [f.eventId, difficulty.get(f.eventId)!.value!])))
      : new Map<string, number>();

  return factors.map((f) => {
    const d = difficulty.get(f.eventId);
    const speedValue = speed.get(f.eventId) ?? null;
    const structuralValue = structural.get(f.eventId) ?? null;
    const components: PbComponent[] = [
      {
        key: 'course_speed',
        label: 'Observed course speed',
        weight: PB_V1.weights.course_speed,
        value: speedValue,
        input: f.factor != null ? `Course Speed Factor ${describeFactor(f.factor)}` : 'Course Speed Factor unavailable',
      },
      {
        key: 'structural',
        label: 'Structural suitability',
        weight: PB_V1.weights.structural,
        value: structuralValue,
        input: d?.value != null ? `Difficulty ${d.value.toFixed(1)}/10 (easier scores higher)` : 'Difficulty unknown',
      },
    ];
    let value: number | null = null;
    let limitedReason: string | null = null;
    if (speedValue == null) {
      limitedReason = f.limitedReason ?? (cohortOk ? 'Course Speed Factor confidence is too low.' : 'Too few events with Course Speed Factors to compare.');
    } else if (structuralValue == null) {
      value = speedValue; // observed speed carries the score; the missing part is shown as missing
    } else {
      value = Math.round(PB_V1.weights.course_speed * speedValue + PB_V1.weights.structural * structuralValue);
    }
    return {
      eventId: f.eventId,
      metric: 'pb',
      version: PB_VERSION,
      asOfDate,
      value,
      cohortSize: cohortOk ? fitted.length : 0,
      components,
      confidence: value == null ? { ...f.confidence, level: 'insufficient' } : f.confidence,
      limitedReason,
    } satisfies PbResult;
  });
}
