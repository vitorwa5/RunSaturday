/**
 * Core analytics in dependency order, from one pass over the inputs:
 *   1. Course Speed Factor V1 (matched runners)
 *   2. Course Difficulty V1 (structural)
 *   3. Competition V1 (every window)
 *   4. PB Score V1 (needs 1 and 2; never computed before course factors exist)
 * Pure; used by the scheduled/CLI recalculation (persisted as snapshots) and by the
 * in-memory demo store.
 */
import type { CompetitionBreakdown, DifficultyBreakdown } from '@runsaturday/shared';
import { windowStart } from '../domain/confidence';
import { computeCompetition, isUsable, type CompetitionOccurrenceInput } from './competition';
import { computeCourseFactors, COURSE_SPEED_V1, type CourseFactorResult, type PerformanceInput } from './courseSpeed';
import { computeDifficulty, type CourseFacts } from './difficulty';
import { computePbScores, type PbResult } from './pbScore';
import { ANALYTICS_WINDOWS } from './versions';

export interface CoreAnalytics {
  asOfDate: string;
  /** eventId → windowDays → breakdown. */
  competition: Map<string, Map<number, CompetitionBreakdown>>;
  /** eventId → breakdown. */
  difficulty: Map<string, DifficultyBreakdown>;
  courseFactors: Map<string, CourseFactorResult>;
  pb: Map<string, PbResult>;
}

/** Keep only performances from usable occurrences (completed, validated, complete results). */
export function usablePerformances(
  performances: readonly (PerformanceInput & { occurrenceKey: string })[],
  occurrences: readonly CompetitionOccurrenceInput[],
): PerformanceInput[] {
  const usable = new Set(occurrences.filter(isUsable).map((o) => `${o.eventId}|${o.date}`));
  return performances.filter((p) => usable.has(p.occurrenceKey)).map(({ occurrenceKey: _k, ...p }) => p);
}

export function computeCoreAnalytics(
  courses: readonly CourseFacts[],
  occurrences: readonly CompetitionOccurrenceInput[],
  performances: readonly PerformanceInput[],
  asOfDate: string,
  options: { bootstrapReplicates?: number } = {},
): CoreAnalytics {
  const eventIds = courses.map((c) => c.eventId);

  // 1. Course Speed Factor (window: the last COURSE_SPEED_V1.WINDOW_DAYS days).
  const speedFrom = windowStart(asOfDate, COURSE_SPEED_V1.WINDOW_DAYS);
  const inSpeedWindow = performances.filter((p) => p.date <= asOfDate && (speedFrom == null || p.date >= speedFrom));
  const courseFactors = new Map(
    computeCourseFactors(eventIds, inSpeedWindow, { asOfDate, replicates: options.bootstrapReplicates }).map((f) => [f.eventId, f]),
  );

  // 2. Difficulty (structural).
  const difficulty = new Map(courses.map((c) => [c.eventId, computeDifficulty(c, asOfDate)]));

  // 3. Competition, every window.
  const competition = new Map<string, Map<number, CompetitionBreakdown>>(eventIds.map((id) => [id, new Map()]));
  for (const windowDays of ANALYTICS_WINDOWS) {
    const from = windowStart(asOfDate, windowDays);
    const inWindow = occurrences.filter((o) => o.date <= asOfDate && (from == null || o.date >= from));
    for (const b of computeCompetition(eventIds, inWindow, { windowDays, asOfDate })) {
      competition.get(b.eventId)?.set(windowDays, b);
    }
  }

  // 4. PB Score from course factors + difficulty.
  const pb = new Map(computePbScores([...courseFactors.values()], difficulty, asOfDate).map((p) => [p.eventId, p]));

  return { asOfDate, competition, difficulty, courseFactors, pb };
}
