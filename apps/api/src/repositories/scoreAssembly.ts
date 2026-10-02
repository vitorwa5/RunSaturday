/**
 * Builds the EventScores DTO from the snapshots behind it: PB Score V1 (from course factors;
 * no fallback to the old demo value), Competition V1 (90-day window), Difficulty V1 and the
 * Course Speed Factor. The legacy demo snapshot still supplies average participants and the
 * Gem base score. Shared by both stores so database and demo modes present scores identically.
 */
import type { CompetitionBreakdown, ConfidenceLevel, CourseSpeedBreakdown, DifficultyBreakdown, EventScores, PbBreakdown } from '@runsaturday/shared';

export interface LegacySnapshot {
  gemBaseScore: number | null;
  sampleSize: number;
  windowDays: number;
  asOfDate: string;
  calculatedAt: string;
}

export function assembleScores(
  legacy: LegacySnapshot | null,
  pb: PbBreakdown | null,
  competition: CompetitionBreakdown | null,
  difficulty: DifficultyBreakdown | null,
  courseSpeed: CourseSpeedBreakdown | null,
): EventScores | null {
  if (!legacy && !pb && !competition && !difficulty && !courseSpeed) return null;
  return {
    pbScore: pb?.value ?? null,
    pbConfidence: pb?.confidence.level ?? 'insufficient',
    gemBaseScore: legacy?.gemBaseScore ?? null,
    sampleSize: legacy?.sampleSize ?? competition?.sampleSize ?? 0,
    windowDays: legacy?.windowDays ?? 90,
    asOfDate: pb?.asOfDate ?? competition?.asOfDate ?? legacy?.asOfDate ?? '',
    calculationVersion: pb?.version ?? 'none',
    calculatedAt: legacy?.calculatedAt ?? '',
    competitionScore: competition?.value ?? null,
    competitionConfidence: competition?.confidence.level ?? 'insufficient',
    competitionConfidenceScore: competition?.confidence.score ?? null,
    competitionSampleSize: competition?.sampleSize ?? 0,
    difficultyScore: difficulty?.value ?? null,
    difficultyConfidence: difficulty?.confidence.level ?? 'insufficient',
    courseSpeedFactor: courseSpeed?.factor ?? null,
    courseSpeedConfidence: (courseSpeed?.confidence.level ?? 'insufficient') as ConfidenceLevel,
    versions: {
      pb: pb?.version ?? 'none',
      competition: competition?.version ?? null,
      difficulty: difficulty?.version ?? null,
      courseSpeed: courseSpeed?.version ?? null,
    },
  };
}
