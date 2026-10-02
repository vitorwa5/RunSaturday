/**
 * Assembles the full DEMO dataset (fictional) for a given "today". Used by both the
 * database seed and the in-memory data store, so the two modes show identical data.
 */
import { addDays, nextSaturday } from '@runsaturday/shared';
import { DEFAULT_SCORE_WINDOW_DAYS } from '../config/analysis';
import { DEMO_EVENTS, DEMO_SCORE_VERSION, DEMO_USER, type DemoEventDefinition } from './demoEvents';
import type { CompetitionOccurrenceInput } from '../analytics/competition';
import { fieldDepthPosition } from '../analytics/competition';
import type { CourseFacts } from '../analytics/difficulty';
import type { PerformanceInput } from '../analytics/courseSpeed';
import { generateDemoHistories, type DemoOccurrence } from './generateDemoHistory';

/** Demo scores exist only for the default window. */
export const DEMO_WINDOW_DAYS = DEFAULT_SCORE_WINDOW_DAYS;

export interface DemoEventBundle {
  /** Demo ids equal slugs so URLs are stable across re-seeds and between modes. */
  id: string;
  def: DemoEventDefinition;
  occurrences: DemoOccurrence[];
  /** Completed occurrences within the window ending at latestDate. */
  sampleSize: number;
  averageParticipants: number | null;
}

export interface DemoDataset {
  /** Latest occurrence date; also the asOfDate of the demo score snapshots. */
  latestDate: string;
  scoreVersion: string;
  events: DemoEventBundle[];
  user: typeof DEMO_USER;
}

/** The most recent Saturday strictly before the upcoming one. */
export function latestCompletedSaturday(today: string): string {
  return addDays(nextSaturday(today), -7);
}

export function buildDemoDataset(today: string): DemoDataset {
  const latestDate = latestCompletedSaturday(today);
  const windowStart = addDays(latestDate, -DEMO_WINDOW_DAYS);

  const histories = generateDemoHistories(DEMO_EVENTS, latestDate);
  const events = DEMO_EVENTS.map((def, i) => {
    const occurrences = histories[i]!;
    const inWindow = occurrences.filter((o) => o.status === 'COMPLETED' && o.date >= windowStart);
    const total = inWindow.reduce((sum, o) => sum + (o.participantCount ?? 0), 0);
    return {
      id: def.slug,
      def,
      occurrences,
      sampleSize: inWindow.length,
      averageParticipants: inWindow.length > 0 ? total / inWindow.length : null,
    };
  });

  return { latestDate, scoreVersion: DEMO_SCORE_VERSION, events, user: DEMO_USER };
}

/** Analytics inputs from the generated Result rows (same derivation as the SQL query). */
export function demoCompetitionInputs(dataset: DemoDataset): CompetitionOccurrenceInput[] {
  return dataset.events.flatMap(({ id, occurrences }) =>
    occurrences.map((o) => {
      const at = (position: number) => o.results.find((r) => r.position === position)?.finishTimeSeconds ?? null;
      const n = o.results.length;
      return {
        eventId: id,
        date: o.date,
        status: o.status === 'COMPLETED' ? ('completed' as const) : ('cancelled' as const),
        // Mirrors the seed: completed demo occurrences are VALID.
        dataQuality: o.status === 'COMPLETED' ? ('valid' as const) : ('unvalidated' as const),
        participantCount: o.participantCount,
        resultCount: n,
        winnerSeconds: at(1),
        thirdSeconds: at(3),
        fifthSeconds: at(5),
        tenthSeconds: at(10),
        fieldDepthSeconds: n > 0 ? at(fieldDepthPosition(n)) : null,
      };
    }),
  );
}

export function demoCourseFacts(dataset: DemoDataset): CourseFacts[] {
  return dataset.events.map(({ id, def }) => ({
    eventId: id,
    elevationM: def.elevationM,
    surface: def.surface.toLowerCase() as CourseFacts['surface'],
    courseType: def.courseType.toLowerCase() as CourseFacts['courseType'],
    laps: def.laps,
  }));
}

/** Pseudonymous matched-runner inputs from the generated results (completed occurrences). */
export function demoPerformances(dataset: DemoDataset): (PerformanceInput & { occurrenceKey: string })[] {
  return dataset.events.flatMap(({ id, occurrences }) =>
    occurrences
      .filter((o) => o.status === 'COMPLETED')
      .flatMap((o) =>
        o.results.map((r) => ({ athleteKey: r.athleteKey, eventId: id, date: o.date, seconds: r.finishTimeSeconds, occurrenceKey: `${id}|${o.date}` })),
      ),
  );
}
