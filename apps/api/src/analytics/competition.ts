/**
 * COMPETITION SCORE V1 (competition_v1): historical competitive depth, 0–100.
 *
 * NOT a course-speed measure: a fast course and a strong field both produce fast times, so
 * this score must not be used to judge whether a course is fast.
 *
 * 1. Per event, from completed, VALIDATED occurrences in the window whose Result rows are
 *    complete, take the median finish time at:
 *      winner (25%), 3rd (25%), 5th (20%), 10th (20%), and field depth (10%) = the
 *      top-10% cutoff, i.e. the time at position ceil(0.10 × field size) (20th of 200).
 *    A component needs at least MIN_COMPONENT_OBSERVATIONS occurrences that reached that
 *    position; otherwise it is missing for that event.
 * 2. Cohort-relative normalisation (no fixed time thresholds): for each component, among
 *    eligible events with a value, an event's strength is the share of the OTHER events it
 *    beats, counting ties as half:
 *      strength = 100 × (#slower + 0.5 × #tied) / (N − 1)
 *    Faster medians give higher strength; equal medians get equal strength; rank-based, so
 *    one extreme value cannot stretch the scale. A component needs a cohort of at least
 *    MIN_COHORT events; otherwise it is missing for everyone.
 * 3. Score = weighted mean of the available components (weights re-normalised). If the
 *    available weight is below MIN_AVAILABLE_WEIGHT the score is null (Limited data).
 * Events with fewer than MIN_OCCURRENCES usable occurrences are outside the cohort and have
 * no score. Scores are relative to the analysed events, not an official or universal rating.
 */
import type { CompetitionBreakdown, CompetitionComponent, OccurrenceStatus } from '@runsaturday/shared';
import { assessConfidence, STABILITY_SCALES } from '../domain/confidence';
import { median } from '../domain/statistics';
import { COMPETITION_VERSION } from './versions';

export const COMPETITION_V1 = {
  weights: { winner: 0.25, third: 0.25, fifth: 0.2, tenth: 0.2, field_depth: 0.1 },
  labels: { winner: 'Winner strength', third: 'Podium depth', fifth: 'Top-5 depth', tenth: 'Top-10 depth', field_depth: 'Field depth' },
  FIELD_DEPTH_FRACTION: 0.1,
  MIN_OCCURRENCES: 3,
  MIN_COMPONENT_OBSERVATIONS: 3,
  MIN_COHORT: 3,
  MIN_AVAILABLE_WEIGHT: 0.5,
} as const;

type ComponentKey = CompetitionComponent['key'];
const KEYS: ComponentKey[] = ['winner', 'third', 'fifth', 'tenth', 'field_depth'];

/** Per-occurrence placing times derived from Result rows (null when the field is too small). */
export interface CompetitionOccurrenceInput {
  eventId: string;
  date: string;
  status: OccurrenceStatus;
  dataQuality: 'valid' | 'partial' | 'unvalidated' | 'rejected';
  participantCount: number | null;
  resultCount: number;
  winnerSeconds: number | null;
  thirdSeconds: number | null;
  fifthSeconds: number | null;
  tenthSeconds: number | null;
  /** Time at position ceil(0.10 × field size). */
  fieldDepthSeconds: number | null;
}

/** Position used for field depth. */
export const fieldDepthPosition = (fieldSize: number) => Math.max(1, Math.ceil(COMPETITION_V1.FIELD_DEPTH_FRACTION * fieldSize));

export function isUsable(o: CompetitionOccurrenceInput): boolean {
  return (
    o.status === 'completed' &&
    o.dataQuality === 'valid' &&
    o.resultCount > 0 &&
    (o.participantCount == null || o.participantCount === o.resultCount)
  );
}

const valueOf = (o: CompetitionOccurrenceInput, key: ComponentKey) =>
  ({ winner: o.winnerSeconds, third: o.thirdSeconds, fifth: o.fifthSeconds, tenth: o.tenthSeconds, field_depth: o.fieldDepthSeconds })[key];

/** Mid-rank strength (0–100) of each value among the others; lower time = stronger. */
export function cohortStrengths(values: ReadonlyMap<string, number>): Map<string, number> {
  const entries = [...values.entries()];
  const result = new Map<string, number>();
  const n = entries.length;
  for (const [id, v] of entries) {
    if (n === 1) {
      result.set(id, 50);
      continue;
    }
    let slower = 0;
    let tied = 0;
    for (const [otherId, w] of entries) {
      if (otherId === id) continue;
      if (w > v) slower++;
      else if (w === v) tied++;
    }
    result.set(id, Math.round((100 * (slower + 0.5 * tied)) / (n - 1)));
  }
  return result;
}

interface EventMedians {
  eventId: string;
  usable: CompetitionOccurrenceInput[];
  excluded: { cancelled: number; insufficientData: number };
  eligibleCount: number;
  medians: Record<ComponentKey, { seconds: number | null; observations: number }>;
}

function eventMedians(eventId: string, occurrences: CompetitionOccurrenceInput[]): EventMedians {
  const usable = occurrences.filter(isUsable);
  const cancelled = occurrences.filter((o) => o.status === 'cancelled').length;
  const medians = {} as EventMedians['medians'];
  for (const key of KEYS) {
    const values = usable.map((o) => valueOf(o, key)).filter((v): v is number => v != null);
    medians[key] = {
      seconds: values.length >= COMPETITION_V1.MIN_COMPONENT_OBSERVATIONS ? median(values) : null,
      observations: values.length,
    };
  }
  return {
    eventId,
    usable,
    excluded: { cancelled, insufficientData: occurrences.length - cancelled - usable.length },
    eligibleCount: occurrences.length - cancelled,
    medians,
  };
}

/**
 * Competition V1 for every event in one window. `occurrences` must already be limited to the
 * window (dates in (asOf − windowDays, asOf]). Deterministic: results are sorted by eventId.
 */
export function computeCompetition(
  eventIds: readonly string[],
  occurrences: readonly CompetitionOccurrenceInput[],
  options: { windowDays: number; asOfDate: string },
): (CompetitionBreakdown & { eventId: string })[] {
  const byEvent = new Map<string, CompetitionOccurrenceInput[]>(eventIds.map((id) => [id, []]));
  for (const o of occurrences) byEvent.get(o.eventId)?.push(o);

  const all = [...byEvent.entries()].map(([id, occ]) => eventMedians(id, occ)).sort((a, b) => a.eventId.localeCompare(b.eventId));
  const cohort = all.filter((e) => e.usable.length >= COMPETITION_V1.MIN_OCCURRENCES);

  const strengths = new Map<ComponentKey, Map<string, number>>();
  for (const key of KEYS) {
    const values = new Map<string, number>();
    for (const e of cohort) if (e.medians[key].seconds != null) values.set(e.eventId, e.medians[key].seconds!);
    strengths.set(key, values.size >= COMPETITION_V1.MIN_COHORT ? cohortStrengths(values) : new Map());
  }

  return all.map((e) => {
    const inCohort = e.usable.length >= COMPETITION_V1.MIN_OCCURRENCES;
    const components: CompetitionComponent[] = KEYS.map((key) => ({
      key,
      label: COMPETITION_V1.labels[key],
      weight: COMPETITION_V1.weights[key],
      value: inCohort ? (strengths.get(key)!.get(e.eventId) ?? null) : null,
      medianSeconds: e.medians[key].seconds,
      observations: e.medians[key].observations,
    }));

    const available = components.filter((c) => c.value != null);
    const availableWeight = available.reduce((s, c) => s + c.weight, 0);
    const value =
      inCohort && availableWeight >= COMPETITION_V1.MIN_AVAILABLE_WEIGHT - 1e-9
        ? Math.round(available.reduce((s, c) => s + c.value! * c.weight, 0) / availableWeight)
        : null;

    // Stability is judged on the field-depth (top-10% cutoff) series, present for every usable occurrence.
    const confidence = assessConfidence({
      observations: e.usable.filter((o) => o.fieldDepthSeconds != null).map((o) => ({ date: o.date, value: o.fieldDepthSeconds! })),
      eligibleCount: e.eligibleCount,
      asOfDate: options.asOfDate,
      stability: STABILITY_SCALES.finishTimes,
    });

    return {
      eventId: e.eventId,
      metric: 'competition',
      version: COMPETITION_VERSION,
      value,
      windowDays: options.windowDays,
      asOfDate: options.asOfDate,
      sampleSize: e.usable.length,
      cohortSize: cohort.length,
      components,
      confidence: value == null ? { ...confidence, level: 'insufficient' } : confidence,
      excluded: e.excluded,
    } satisfies CompetitionBreakdown & { eventId: string };
  });
}
