/**
 * PB Finder. Ranks events by the STORED PB Score (demo values in Phase 2B); it does not
 * compute a new PB model. Other sorts are plain factual orderings.
 */
import {
  DEFAULT_PLANNER_FILTERS,
  type EventSummary,
  type PbFinderSortId,
  type PlannerFilters,
  type Recommendation,
} from '@runsaturday/shared';
import { matchesFilters } from './plannerFilters';
import { explain, highlights } from './recommendations';

export type PbFinderFilters = Pick<PlannerFilters, 'surface' | 'elevation' | 'confidence' | 'visited'>;

const limited = (e: EventSummary) => !e.scores || e.scores.pbConfidence === 'insufficient';

/** Ascending comparison where null sorts last. */
const nullsLast = (a: number | null | undefined, b: number | null | undefined) =>
  a == null && b == null ? 0 : a == null ? 1 : b == null ? -1 : a - b;

const negate = (v: number | null | undefined) => (v == null ? null : -v);

const COMPARATORS: Record<PbFinderSortId, (a: EventSummary, b: EventSummary) => number> = {
  // Highest PB Score first; limited-data events never outrank events with enough data.
  pb: (a, b) => Number(limited(a)) - Number(limited(b)) || nullsLast(negate(a.scores?.pbScore), negate(b.scores?.pbScore)),
  travel: (a, b) => nullsLast(a.travel?.minutes, b.travel?.minutes),
  elevation: (a, b) => nullsLast(a.elevationM, b.elevationM),
  difficulty: (a, b) => nullsLast(a.scores?.difficultyScore, b.scores?.difficultyScore),
};

export function pbFinder(
  events: EventSummary[],
  options: { maxTravelMinutes: number; filters: PbFinderFilters; sort: PbFinderSortId },
): { results: Recommendation[]; counts: { total: number; withinTravel: number; matching: number } } {
  const withinTravel = events.filter((e) => e.travel && e.travel.minutes <= options.maxTravelMinutes);
  const matching = withinTravel.filter((e) => matchesFilters(e, { ...DEFAULT_PLANNER_FILTERS, ...options.filters }));
  const sorted = [...matching].sort((a, b) => COMPARATORS[options.sort](a, b) || a.name.localeCompare(b.name));
  return {
    results: sorted.map((e, i) => ({
      rank: i + 1,
      event: e,
      rankedBy: { key: 'pb_score', label: 'PB Score', value: e.scores?.pbScore ?? null, outOf: 100, direction: 'higher_is_better' },
      highlights: highlights(e, 'pb'),
      reasons: explain(e, 'pb', options.maxTravelMinutes),
    })),
    counts: { total: events.length, withinTravel: withinTravel.length, matching: matching.length },
  };
}
