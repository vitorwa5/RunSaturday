/**
 * PLACEHOLDER RANKING (Phase 1/2A).
 *
 * Orders events by one stored metric per goal so Home and the Saturday Planner can be
 * built and tested. It deliberately does NOT compute a Saturday Score; that objective-
 * weighted model (PB Score, conditions, travel, reliability…) replaces this later.
 *
 * Rules that already apply and must survive the replacement:
 * - every pick says which metric it was ranked by and why;
 * - low-data events never outrank events with sufficient data;
 * - wording stays historical, never a promise about this Saturday.
 */
import {
  formatFinishTime,
  goalDefinition,
  type BestPickResponse,
  type EventSummary,
  type FormReference,
  type Goal,
  type Recommendation,
  type RecommendationReason,
} from '@runsaturday/shared';
import type { PlaceInsight, RankingContext } from './rankingContext';

type RankableGoal = Exclude<Goal, 'challenge'>;

interface GoalStrategy {
  /** Short description shown after "Demo recommendation ·". */
  method: string;
  rankedBy: Omit<Recommendation['rankedBy'], 'value'>;
  /** Metric used for ranking; null = cannot be ranked for this goal. */
  metric: (e: EventSummary) => number | null;
  /** Optional eligibility rule. */
  eligible?: (e: EventSummary) => boolean;
  /** Highlight tags to prefer for this goal, in order. */
  highlightPriority: string[];
}

const STRATEGIES: Record<RankableGoal, GoalStrategy> = {
  pb: {
    method: 'ranked using PB Score',
    rankedBy: { key: 'pb_score', label: 'PB opportunity', outOf: 100, direction: 'higher_is_better' },
    metric: (e) => e.scores?.pbScore ?? null,
    highlightPriority: ['Fast', 'Flat', 'Tarmac', 'Close by'],
  },
  place: {
    method: 'ranked using lowest Competition Score',
    rankedBy: { key: 'competition_score', label: 'Competition', outOf: 100, direction: 'lower_is_better' },
    metric: (e) => e.scores?.competitionScore ?? null,
    highlightPriority: ['Lower competition', 'Small field', 'Close by'],
  },
  hidden_gem: {
    method: 'ranked using Gem Score',
    rankedBy: { key: 'gem_score', label: 'Gem score', outOf: 100, direction: 'higher_is_better' },
    metric: (e) => e.scores?.gemBaseScore ?? null,
    highlightPriority: ['Small field', 'Lower competition', 'New to you'],
  },
  new_event: {
    method: 'events you have not run, nearest first',
    rankedBy: { key: 'travel_minutes', label: 'Estimated travel', unit: 'min', direction: 'lower_is_better' },
    metric: (e) => e.travel?.minutes ?? null,
    eligible: (e) => e.visited !== true,
    highlightPriority: ['New to you', 'Close by'],
  },
  quiet: {
    method: 'ranked using fewest average runners',
    rankedBy: { key: 'average_participants', label: 'Average runners', direction: 'lower_is_better' },
    metric: (e) => e.averageParticipants,
    highlightPriority: ['Small field', 'Close by'],
  },
};

const hasLimitedData = (e: EventSummary) => !e.scores || e.scores.pbConfidence === 'insufficient';

/** High Finish with Current Form: share of past events where the converted form reached the top 10. */
function placeStrategy(place: Map<string, PlaceInsight>): GoalStrategy {
  return {
    method: 'ranked by how often your Current Form, converted to each course, historically reached the top 10',
    rankedBy: { key: 'historical_top10', label: 'Top 10 historically', unit: '%', direction: 'higher_is_better' },
    metric: (e) => {
      const p = place.get(e.id);
      return p && p.frequency.of > 0 ? Math.round((100 * p.frequency.count) / p.frequency.of) : null;
    },
    highlightPriority: ['Lower competition', 'Small field', 'Close by'],
  };
}

/** Hidden Gem with hidden_gem_v1 scores (same as the Hidden Gems tool). */
function gemStrategy(gemScores: Map<string, number>): GoalStrategy {
  return { ...STRATEGIES.hidden_gem, method: 'ranked using Gem Score (hidden_gem_v1)', metric: (e) => gemScores.get(e.id) ?? null };
}

/** Short tags describing an event, most relevant to the goal first (max 3). */
export function highlights(e: EventSummary, goal: Goal): string[] {
  const s = e.scores;
  const tags = new Set<string>();
  if (s?.pbScore != null && s.pbScore >= 85) tags.add('Fast');
  if (e.elevationM != null && e.elevationM < 25) tags.add('Flat');
  if (e.elevationM != null && e.elevationM >= 80) tags.add('Hilly');
  if (e.surface === 'tarmac') tags.add('Tarmac');
  if (e.surface === 'trail') tags.add('Trail');
  if (s?.competitionScore != null && s.competitionScore < 45) tags.add('Lower competition');
  if (e.averageParticipants != null && e.averageParticipants < 150) tags.add('Small field');
  if (e.averageParticipants != null && e.averageParticipants >= 350) tags.add('Big field');
  if (e.visited === false) tags.add('New to you');
  if (e.travel && e.travel.minutes <= 15) tags.add('Close by');

  const priority = goal === 'challenge' ? [] : STRATEGIES[goal].highlightPriority;
  const ordered = [...priority.filter((t) => tags.has(t)), ...[...tags].filter((t) => !priority.includes(t))];
  return ordered.slice(0, 3);
}

/** Full "Why this?" explanation using only stored values. */
export function explain(e: EventSummary, goal: Goal, maxTravelMinutes: number | null): RecommendationReason[] {
  const reasons: RecommendationReason[] = [];
  const s = e.scores;
  const add = (text: string, tone: RecommendationReason['tone'] = 'positive') => reasons.push({ text, tone });
  const round = (n: number) => Math.round(n);

  if (goal === 'pb' && s?.pbScore != null) {
    if (s.pbScore >= 85) add(`High PB Score (${round(s.pbScore)}/100)`);
    else if (s.pbScore >= 65) add(`Good PB Score (${round(s.pbScore)}/100)`);
    else add(`Lower PB Score (${round(s.pbScore)}/100)`, 'caution');
  }
  if ((goal === 'pb' || goal === 'place') && s?.difficultyScore != null) {
    if (s.difficultyScore <= 3.5) add(`Low course difficulty (${s.difficultyScore.toFixed(1)}/10)`);
    else if (s.difficultyScore >= 6.5) add(`Demanding course (${s.difficultyScore.toFixed(1)}/10)`, 'caution');
  }
  if (goal === 'place' && s?.competitionScore != null) {
    if (s.competitionScore < 55) add(`Lower historical competition (${round(s.competitionScore)}/100)`);
    else if (s.competitionScore >= 70) add(`Strong historical competition (${round(s.competitionScore)}/100)`, 'caution');
  }
  if (goal === 'hidden_gem' && s?.gemBaseScore != null && s.gemBaseScore >= 70) add(`High Gem Score (${round(s.gemBaseScore)}/100)`);
  if (e.averageParticipants != null && (goal === 'quiet' || goal === 'hidden_gem' || goal === 'place')) {
    if (e.averageParticipants < 150) add(`Small field (about ${e.averageParticipants} runners on average)`);
    else if (goal === 'quiet' && e.averageParticipants >= 300) add(`Large field (about ${e.averageParticipants} runners)`, 'caution');
  }
  if (e.elevationM != null && e.elevationM < 25) add(`Very low elevation (${e.elevationM} m)`);
  else if (e.elevationM != null && e.elevationM >= 80 && goal === 'pb') add(`Hilly (${e.elevationM} m elevation)`, 'caution');
  if (e.visited === false && (goal === 'new_event' || goal === 'hidden_gem')) add('You have not run here yet');

  if (e.travel) {
    add(
      maxTravelMinutes != null
        ? `Within your travel limit (about ${e.travel.minutes} of ${maxTravelMinutes} min, estimated)`
        : `About ${e.travel.minutes} min away (estimated)`,
    );
  }

  // PB Score confidence is the Course Speed Factor's: it rests on matched runners, not event counts.
  if (hasLimitedData(e)) add('PB Score unavailable: limited matched-runner data', 'caution');
  else if (s?.pbConfidence === 'high') add('High confidence (course speed from many matched runners)');
  else if (s?.pbConfidence === 'medium') add('Medium confidence (course speed from matched runners)');
  else if (s?.pbConfidence === 'low') add('Low confidence (few matched runners)', 'caution');

  return reasons;
}

export interface Ranking {
  goal: Goal;
  method: string;
  results: Recommendation[];
  /** Explanation when goal cannot be ranked. */
  unavailableMessage?: string;
}

export const CHALLENGE_UNAVAILABLE =
  'Challenge ranking in the Saturday Planner is not available yet. My Challenges shows your progress and the events that would complete each challenge.';

/**
 * Rank already-filtered events for a goal. Events outside `maxTravelMinutes` are excluded.
 * Deterministic: ties are broken alphabetically.
 */
export function rankEvents(goal: Goal, events: EventSummary[], maxTravelMinutes: number | null, context?: RankingContext): Ranking {
  if (!goalDefinition(goal).available || goal === 'challenge') {
    return { goal, method: 'not available yet', results: [], unavailableMessage: CHALLENGE_UNAVAILABLE };
  }

  // High Finish and Hidden Gem use the runner's Current Form when the context provides it;
  // without it, High Finish falls back (transparently) to the lowest Competition Score.
  const place = goal === 'place' ? (context?.place ?? null) : null;
  const strategy =
    place != null
      ? placeStrategy(place)
      : goal === 'hidden_gem' && context?.gemScores
        ? gemStrategy(context.gemScores)
        : goal === 'place' && context
          ? { ...STRATEGIES.place, method: `${STRATEGIES.place.method} (Current Form unavailable)` }
          : STRATEGIES[goal];
  const limited = (e: EventSummary) => (place ? (place.get(e.id)?.limited ?? true) : hasLimitedData(e));
  const candidates = events.filter(
    (e) =>
      (maxTravelMinutes == null || (e.travel != null && e.travel.minutes <= maxTravelMinutes)) &&
      (strategy.eligible?.(e) ?? true) &&
      strategy.metric(e) != null,
  );

  const direction = strategy.rankedBy.direction === 'lower_is_better' ? 1 : -1;
  const ranked = [...candidates].sort(
    (a, b) =>
      Number(limited(a)) - Number(limited(b)) ||
      direction * (strategy.metric(a)! - strategy.metric(b)!) ||
      (place ? place.get(a.id)!.medianHigh - place.get(b.id)!.medianHigh : 0) ||
      a.name.localeCompare(b.name),
  );

  return {
    goal,
    method: strategy.method,
    results: ranked.map((e, i) => ({
      rank: i + 1,
      event: e,
      rankedBy: { ...strategy.rankedBy, value: strategy.metric(e) },
      highlights: highlights(e, goal),
      reasons: place ? [...placeReasons(place.get(e.id)!, context!.form!), ...explain(e, goal, maxTravelMinutes)] : explain(e, goal, maxTravelMinutes),
    })),
  };
}

function placeReasons(p: PlaceInsight, form: FormReference): RecommendationReason[] {
  return [
    {
      text: `Top 10 in ${p.frequency.count} of ${p.frequency.of} recent events with your Current Form ≈ ${formatFinishTime(form.formSeconds)} (≈ ${formatFinishTime(p.equivalentSeconds)} here)`,
      tone: p.limited ? 'caution' : 'positive',
    },
  ];
}

export function bestPick(
  goal: Goal,
  events: EventSummary[],
  options: { date: string; maxTravelMinutes: number | null; alternatives?: number; context?: RankingContext },
): BestPickResponse {
  const ranking = rankEvents(goal, events, options.maxTravelMinutes, options.context);
  const [first, ...rest] = ranking.results;
  const base = { goal, date: options.date, method: ranking.method };

  if (ranking.unavailableMessage) return { ...base, pick: null, alternatives: [], message: ranking.unavailableMessage };
  if (!first) {
    return {
      ...base,
      pick: null,
      alternatives: [],
      message:
        options.maxTravelMinutes != null
          ? `No suitable events within ${options.maxTravelMinutes} minutes. Try a longer travel limit in the planner.`
          : 'No suitable events found.',
    };
  }
  return { ...base, pick: first, alternatives: rest.slice(0, options.alternatives ?? 3) };
}
