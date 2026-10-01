/**
 * Builds the EventScores DTO from the snapshots behind it: the demo PB snapshot (until
 * Phase 3B) plus Competition V1 (90-day window) and Difficulty V1. Shared by both stores so
 * database and demo modes present scores identically.
 */
import type { CompetitionBreakdown, ConfidenceLevel, DifficultyBreakdown, EventScores } from '@runsaturday/shared';

export interface PbSnapshot {
  pbScore: number | null;
  gemBaseScore: number | null;
  pbConfidence: ConfidenceLevel;
  sampleSize: number;
  windowDays: number;
  asOfDate: string;
  calculationVersion: string;
  calculatedAt: string;
}

export function assembleScores(
  pb: PbSnapshot | null,
  competition: CompetitionBreakdown | null,
  difficulty: DifficultyBreakdown | null,
): EventScores | null {
  if (!pb && !competition && !difficulty) return null;
  return {
    pbScore: pb?.pbScore ?? null,
    gemBaseScore: pb?.gemBaseScore ?? null,
    pbConfidence: pb?.pbConfidence ?? 'insufficient',
    sampleSize: pb?.sampleSize ?? 0,
    windowDays: pb?.windowDays ?? 90,
    asOfDate: pb?.asOfDate ?? competition?.asOfDate ?? difficulty?.asOfDate ?? '',
    calculationVersion: pb?.calculationVersion ?? 'none',
    calculatedAt: pb?.calculatedAt ?? '',
    competitionScore: competition?.value ?? null,
    competitionConfidence: competition?.confidence.level ?? 'insufficient',
    competitionConfidenceScore: competition?.confidence.score ?? null,
    competitionSampleSize: competition?.sampleSize ?? 0,
    difficultyScore: difficulty?.value ?? null,
    difficultyConfidence: difficulty?.confidence.level ?? 'insufficient',
    versions: { pb: pb?.calculationVersion ?? 'none', competition: competition?.version ?? null, difficulty: difficulty?.version ?? null },
  };
}
