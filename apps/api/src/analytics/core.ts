/**
 * Core analytics: Competition V1 for every window and Difficulty V1, from one pass over the
 * occurrence inputs. Pure; used by the scheduled/CLI recalculation (persisted as EventScore
 * snapshots) and by the in-memory demo store.
 */
import type { CompetitionBreakdown, DifficultyBreakdown } from '@runsaturday/shared';
import { windowStart } from '../domain/confidence';
import { computeCompetition, type CompetitionOccurrenceInput } from './competition';
import { computeDifficulty, type CourseFacts } from './difficulty';
import { ANALYTICS_WINDOWS } from './versions';

export interface CoreAnalytics {
  asOfDate: string;
  /** eventId → windowDays → breakdown. */
  competition: Map<string, Map<number, CompetitionBreakdown>>;
  /** eventId → breakdown. */
  difficulty: Map<string, DifficultyBreakdown>;
}

export function computeCoreAnalytics(
  courses: readonly CourseFacts[],
  occurrences: readonly CompetitionOccurrenceInput[],
  asOfDate: string,
): CoreAnalytics {
  const eventIds = courses.map((c) => c.eventId);
  const competition = new Map<string, Map<number, CompetitionBreakdown>>(eventIds.map((id) => [id, new Map()]));
  for (const windowDays of ANALYTICS_WINDOWS) {
    const from = windowStart(asOfDate, windowDays);
    const inWindow = occurrences.filter((o) => o.date <= asOfDate && (from == null || o.date >= from));
    for (const b of computeCompetition(eventIds, inWindow, { windowDays, asOfDate })) {
      competition.get(b.eventId)?.set(windowDays, b);
    }
  }
  const difficulty = new Map(courses.map((c) => [c.eventId, computeDifficulty(c, asOfDate)]));
  return { asOfDate, competition, difficulty };
}
