/**
 * COURSE DIFFICULTY V1 (difficulty_v1): a STRUCTURAL rating, 1.0–10.0.
 *
 * Uses known course characteristics only. Finishing times and competition are deliberately
 * NOT used (observed course-speed evidence arrives in Phase 3B).
 *
 *   severity = weighted mean of the KNOWN components (weights re-normalised), each 0–100
 *     elevation  55%  min(elevation, ELEVATION_CAP_M) / ELEVATION_CAP_M × 100
 *     surface    25%  SURFACE_SEVERITY mapping
 *     structure  20%  STRUCTURE_SEVERITY by course type (falls back to the lap count)
 *   difficulty = 1 + 9 × severity / 100, rounded to 0.1
 *
 * Unknown inputs are never treated as easy: they are left out, flagged as missing in the
 * breakdown, and lower the confidence. If less than MIN_KNOWN_WEIGHT of the weight is known
 * the rating is null. The surface mapping is a structural tendency, not a claim that every
 * trail course is slow.
 */
import type { ConfidenceLevel, CourseType, DifficultyBreakdown, DifficultyComponent, Surface } from '@runsaturday/shared';
import { DIFFICULTY_VERSION } from './versions';

export const DIFFICULTY_V1 = {
  weights: { elevation: 0.55, surface: 0.25, structure: 0.2 },
  ELEVATION_CAP_M: 150,
  /** Relative structural severity of each surface (unknown = missing). */
  SURFACE_SEVERITY: { tarmac: 0, mixed: 40, grass: 70, trail: 70 } satisfies Record<Exclude<Surface, 'unknown'>, number>,
  /** More laps and turnarounds add turns and congestion (unknown = missing). */
  STRUCTURE_SEVERITY: {
    point_to_point: 0,
    one_lap: 10,
    out_and_back: 35,
    two_laps: 45,
    three_plus_laps: 70,
  } satisfies Record<Exclude<CourseType, 'unknown'>, number>,
  /** Used only when the course type is unknown. */
  LAP_SEVERITY: (laps: number) => (laps <= 1 ? 10 : laps === 2 ? 45 : 70),
  MIN_KNOWN_WEIGHT: 0.45,
} as const;

const SURFACE_NAMES: Record<Surface, string> = { tarmac: 'Tarmac', mixed: 'Mixed', grass: 'Grass', trail: 'Trail', unknown: 'Unknown' };
const COURSE_NAMES: Record<CourseType, string> = {
  one_lap: '1 lap',
  two_laps: '2 laps',
  three_plus_laps: '3+ laps',
  out_and_back: 'Out and back',
  point_to_point: 'Point to point',
  unknown: 'Unknown',
};

export interface CourseFacts {
  eventId: string;
  elevationM: number | null;
  surface: Surface;
  courseType: CourseType;
  laps: number | null;
}

/** Structural confidence: what share of the weight is backed by known facts. */
function structuralConfidence(components: DifficultyComponent[]): { level: ConfidenceLevel; score: number; detail: string } {
  const known = components.filter((c) => !c.missing);
  const score = Math.round(100 * known.reduce((s, c) => s + c.weight, 0));
  const missing = components.filter((c) => c.missing).map((c) => c.label.toLowerCase());
  const elevationKnown = known.some((c) => c.key === 'elevation');
  let level: ConfidenceLevel;
  if (missing.length === 0) level = 'high';
  else if (score < DIFFICULTY_V1.MIN_KNOWN_WEIGHT * 100) level = 'insufficient';
  else if (!elevationKnown) level = 'low';
  else level = 'medium';
  return { level, score, detail: missing.length ? `Missing: ${missing.join(', ')}` : 'All structural inputs known' };
}

export function computeDifficulty(facts: CourseFacts, asOfDate: string): DifficultyBreakdown {
  const { weights, ELEVATION_CAP_M, SURFACE_SEVERITY, STRUCTURE_SEVERITY, LAP_SEVERITY } = DIFFICULTY_V1;

  const elevation: DifficultyComponent =
    facts.elevationM == null
      ? { key: 'elevation', label: 'Elevation', weight: weights.elevation, value: null, input: 'Unknown', missing: true }
      : {
          key: 'elevation',
          label: 'Elevation',
          weight: weights.elevation,
          value: Math.round((100 * Math.min(Math.max(facts.elevationM, 0), ELEVATION_CAP_M)) / ELEVATION_CAP_M),
          input: `${facts.elevationM} m`,
          missing: false,
        };

  const surface: DifficultyComponent =
    facts.surface === 'unknown'
      ? { key: 'surface', label: 'Surface', weight: weights.surface, value: null, input: 'Unknown', missing: true }
      : { key: 'surface', label: 'Surface', weight: weights.surface, value: SURFACE_SEVERITY[facts.surface], input: SURFACE_NAMES[facts.surface], missing: false };

  let structure: DifficultyComponent;
  if (facts.courseType !== 'unknown') {
    structure = { key: 'structure', label: 'Course structure', weight: weights.structure, value: STRUCTURE_SEVERITY[facts.courseType], input: COURSE_NAMES[facts.courseType], missing: false };
  } else if (facts.laps != null && facts.laps > 0) {
    structure = { key: 'structure', label: 'Course structure', weight: weights.structure, value: LAP_SEVERITY(facts.laps), input: `${facts.laps} ${facts.laps === 1 ? 'lap' : 'laps'}`, missing: false };
  } else {
    structure = { key: 'structure', label: 'Course structure', weight: weights.structure, value: null, input: 'Unknown', missing: true };
  }

  const components = [elevation, surface, structure];
  const known = components.filter((c) => !c.missing);
  const knownWeight = known.reduce((s, c) => s + c.weight, 0);
  const conf = structuralConfidence(components);

  const value =
    knownWeight >= DIFFICULTY_V1.MIN_KNOWN_WEIGHT - 1e-9
      ? Math.round((1 + (9 * known.reduce((s, c) => s + c.value! * c.weight, 0)) / knownWeight / 100) * 10) / 10
      : null;

  return {
    metric: 'difficulty',
    version: DIFFICULTY_VERSION,
    value,
    asOfDate,
    components,
    confidence: {
      level: value == null ? 'insufficient' : conf.level,
      score: conf.score,
      factors: [{ key: 'structure', label: 'Known course facts', weight: 1, value: conf.score, detail: conf.detail }],
    },
  };
}
