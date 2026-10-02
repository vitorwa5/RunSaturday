/**
 * Runner-ability inputs for the goals whose ranking genuinely depends on the runner:
 *   - High Finish ("place"): how often the runner's Current Form, converted to each course
 *     (form × target factor), would historically have reached the top 10 (last 90 days), using
 *     the unchanged placement engine;
 *   - Hidden Gem: hidden_gem_v1 Gem Scores, whose placement opportunity uses the same converted
 *     Current Form (identical to the Hidden Gems tool).
 * PB, New Event, Quiet and Challenge do not use runner ability, so nothing is computed for them.
 * An old Overall 5K PB is never used as current ability.
 */
import { DEFAULT_HISTORY_WINDOW, formatFinishTime, type ConfidenceLevel, type EventSummary, type FormReference, type Goal, type HiddenGem, type HistoricalFrequency } from '@runsaturday/shared';
import type { DataStore, UserRecord } from '../repositories/DataStore';
import { rankHiddenGems } from './hiddenGemService';
import { computeAdjustedPlacements } from './placementService';
import { formReferenceOf, formUnavailableNote } from './runnerForm';

export interface PlaceInsight {
  /** Historical top-10 count over usable events (conservative tie handling). */
  frequency: HistoricalFrequency;
  /** Conservative end of the median placing. */
  medianHigh: number;
  /** Current Form converted to this course. */
  equivalentSeconds: number;
  /** Too little placement data to be trusted. */
  limited: boolean;
  /** Confidence of the placement result (data and course adjustment). */
  confidence: ConfidenceLevel;
}

export interface RankingContext {
  /** The Current Form used for ranking, or null when none was used. */
  form: FormReference | null;
  /** High Finish inputs per event (only when Current Form is available). */
  place: Map<string, PlaceInsight> | null;
  /** hidden_gem_v1 Gem Score per event. */
  gemScores: Map<string, number> | null;
  /** The hidden_gem_v1 ranking itself (mode "all"), exactly as the Hidden Gems tool returns it. */
  gems: HiddenGem[] | null;
}

/** Goals whose ranking depends on the runner's ability. */
export const ABILITY_GOALS: ReadonlySet<Goal> = new Set(['place', 'hidden_gem', 'surprise']);

export async function rankingContext(
  store: DataStore,
  user: UserRecord | null,
  goal: Goal,
  events: EventSummary[],
  options: { maxTravelMinutes: number; today: string },
): Promise<RankingContext> {
  if (!ABILITY_GOALS.has(goal)) return { form: null, place: null, gemScores: null, gems: null };
  const form = user ? formReferenceOf(user.currentForm) : null;
  const inRange = events.filter((e) => e.travel && e.travel.minutes <= options.maxTravelMinutes);

  let place: Map<string, PlaceInsight> | null = null;
  const top10ByEvent = new Map<string, HistoricalFrequency | null>();
  if (form) {
    const factors = new Map((await store.listCourseFactors()).map((f) => [f.eventId, f]));
    const { placements } = await computeAdjustedPlacements(store, inRange, {
      window: DEFAULT_HISTORY_WINDOW,
      target: 'top10',
      today: options.today,
      form,
      factors,
    });
    place = new Map();
    for (const p of placements) {
      if (!p.stats) continue;
      const limited = p.confidence === 'insufficient';
      place.set(p.event.id, { frequency: p.stats.frequencies.top10, medianHigh: p.stats.medianPlacement.high, equivalentSeconds: p.analysedSeconds, limited, confidence: p.confidence });
      top10ByEvent.set(p.event.id, limited ? null : p.stats.frequencies.top10);
    }
  }

  const gems = rankHiddenGems(inRange, { mode: 'all', maxTravelMinutes: options.maxTravelMinutes, timeSeconds: form?.formSeconds ?? null, top10ByEvent });
  const usesGems = goal === 'hidden_gem' || goal === 'surprise';
  return {
    form,
    place: goal === 'place' ? place : null,
    gemScores: usesGems ? new Map(gems.map((g) => [g.event.id, g.gemScore])) : null,
    gems: usesGems ? gems : null,
  };
}

/** Honest, goal-specific statement of what the ranking used. */
export function abilityNote(goal: Goal, user: UserRecord | null, context: RankingContext): string {
  const formText = context.form ? `your Current Form ≈ ${formatFinishTime(context.form.formSeconds)} (${context.form.confidence} confidence)` : null;
  const unavailable = `${user ? formUnavailableNote(user.currentForm) : 'Current Form unavailable.'} Your Overall 5K PB is not used as current ability.`;
  switch (goal) {
    case 'place':
      return formText
        ? `High Finish uses ${formText}, converted to each course, and how that equivalent placed in past results.`
        : `${unavailable} High Finish falls back to the lowest Competition Score.`;
    case 'hidden_gem':
      return formText
        ? `Hidden Gem placement opportunity uses ${formText}, converted to each course.`
        : `${unavailable} Hidden Gem placement opportunity falls back to the inverse of Competition Score.`;
    case 'pb':
      return 'PB ranking uses PB Score, a course characteristic (observed course speed and structure). It does not depend on your ability.';
    case 'new_event':
      return 'New Event ranks events you have not run by estimated travel. It does not depend on your ability.';
    case 'quiet':
      return 'Quiet ranks events by average field size. It does not depend on your ability.';
    case 'challenge':
      return 'Complete a challenge lists events that would complete a missing challenge item, nearest first. It does not depend on your ability.';
    case 'surprise':
      return formText
        ? `Surprise me balances novelty, challenges, travel and Hidden Gem strength (which uses ${formText}). It is not a performance ranking.`
        : 'Surprise me balances novelty, challenges, travel and Hidden Gem strength. It is not a performance ranking.';
  }
}
