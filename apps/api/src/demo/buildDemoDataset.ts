/**
 * Assembles the full DEMO dataset (fictional) for a given "today". Used by both the
 * database seed and the in-memory data store, so the two modes show identical data.
 */
import { addDays, nextSaturday } from '@runsaturday/shared';
import { DEMO_EVENTS, DEMO_SCORE_VERSION, DEMO_USER, type DemoEventDefinition } from './demoEvents';
import { generateDemoHistory, type DemoOccurrence } from './generateDemoHistory';

export const DEMO_WINDOW_DAYS = 90;

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

  const events = DEMO_EVENTS.map((def) => {
    const occurrences = generateDemoHistory(def, latestDate);
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
