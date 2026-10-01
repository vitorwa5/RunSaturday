/**
 * PHASE 1 PLACEHOLDER RANKING.
 *
 * Orders events by one stored metric per goal so the Home screen can be built and
 * tested. It deliberately does NOT compute a Saturday Score; that objective-weighted
 * model (PB Score, conditions, travel, reliability…) replaces this in a later phase.
 *
 * Rules that already apply and must survive the replacement:
 * - every pick says which metric it was ranked by and why;
 * - low-data events never outrank events with sufficient data;
 * - wording stays historical, never a promise about this Saturday.
 */
import type { BestPickResponse, EventSummary, Goal, Recommendation, RecommendationReason } from '@runsaturday/shared';

interface GoalStrategy {
  method: string;
  rankedByLabel: string;
  unit?: string;
  /** Metric used for ranking; null = cannot be ranked for this goal. */
  metric: (e: EventSummary) => number | null;
  /** true when a lower metric is better. */
  ascending: boolean;
  /** Optional eligibility filter. */
  eligible?: (e: EventSummary) => boolean;
}

const STRATEGIES: Record<Exclude<Goal, 'challenge'>, GoalStrategy> = {
  pb: {
    method: 'Ranked by PB Score (demo values) within your travel limit.',
    rankedByLabel: 'PB Score',
    metric: (e) => e.scores?.pbScore ?? null,
    ascending: false,
  },
  place: {
    method: 'Ranked by lowest Competition Score (demo values) within your travel limit.',
    rankedByLabel: 'Competition',
    metric: (e) => e.scores?.competitionScore ?? null,
    ascending: true,
  },
  hidden_gem: {
    method: 'Ranked by base Gem Score (demo values) within your travel limit.',
    rankedByLabel: 'Gem Score',
    metric: (e) => e.scores?.gemBaseScore ?? null,
    ascending: false,
  },
  new_event: {
    method: 'Events you have not visited, nearest first.',
    rankedByLabel: 'Travel',
    unit: 'min',
    metric: (e) => e.travel?.minutes ?? null,
    ascending: true,
    eligible: (e) => e.visited !== true,
  },
  quiet: {
    method: 'Ranked by fewest average runners within your travel limit.',
    rankedByLabel: 'Avg runners',
    metric: (e) => e.averageParticipants,
    ascending: true,
  },
};

const hasLimitedData = (e: EventSummary) => !e.scores || e.scores.pbConfidence === 'insufficient';

export function explain(e: EventSummary, goal: Goal): RecommendationReason[] {
  const reasons: RecommendationReason[] = [];
  const s = e.scores;
  const add = (text: string, tone: RecommendationReason['tone'] = 'positive') => reasons.push({ text, tone });

  if (goal === 'pb' && s?.pbScore != null) add(`PB Score ${Math.round(s.pbScore)}/100`);
  if (goal === 'place' && s?.competitionScore != null && s.competitionScore < 55)
    add(`Lower historical competition (${Math.round(s.competitionScore)}/100)`);
  if (goal === 'hidden_gem' && s?.gemBaseScore != null) add(`Gem Score ${Math.round(s.gemBaseScore)}/100`);
  if ((goal === 'quiet' || goal === 'hidden_gem') && e.averageParticipants != null && e.averageParticipants < 150)
    add(`Small field (~${e.averageParticipants} runners on average)`);
  if (goal === 'new_event' && e.visited === false) add('You have not run here yet');

  if (e.elevationM != null && e.elevationM < 25) add(`Very low elevation (${e.elevationM} m)`);
  else if (e.elevationM != null && e.elevationM >= 80 && goal === 'pb') add(`Hilly (${e.elevationM} m)`, 'caution');
  if (e.surface === 'tarmac' && goal === 'pb') add('Tarmac surface');
  if (e.travel) add(`About ${e.travel.minutes} min away (estimate)`);

  if (hasLimitedData(e)) add(`Limited data: only ${s?.sampleSize ?? 0} recent events`, 'caution');
  else if (s?.pbConfidence === 'high') add(`High data confidence (${s.sampleSize} events in ${s.windowDays} days)`);

  return reasons;
}

export function bestPick(
  goal: Goal,
  events: EventSummary[],
  options: { date: string; maxTravelMinutes: number | null; alternatives?: number },
): BestPickResponse {
  const base = { goal, date: options.date, alternatives: [] as Recommendation[] };

  if (goal === 'challenge') {
    return {
      ...base,
      method: 'Not available yet.',
      pick: null,
      message: 'Challenge tracking is not available yet. It arrives once personal run history is supported.',
    };
  }

  const strategy = STRATEGIES[goal];
  const candidates = events.filter(
    (e) =>
      (options.maxTravelMinutes == null || (e.travel && e.travel.minutes <= options.maxTravelMinutes)) &&
      (strategy.eligible?.(e) ?? true) &&
      strategy.metric(e) != null,
  );

  const direction = strategy.ascending ? 1 : -1;
  const ranked = [...candidates].sort(
    (a, b) =>
      Number(hasLimitedData(a)) - Number(hasLimitedData(b)) ||
      direction * (strategy.metric(a)! - strategy.metric(b)!) ||
      a.name.localeCompare(b.name),
  );

  const toRecommendation = (e: EventSummary): Recommendation => ({
    event: e,
    rankedBy: { label: strategy.rankedByLabel, value: strategy.metric(e), ...(strategy.unit ? { unit: strategy.unit } : {}) },
    reasons: explain(e, goal),
  });

  const [first, ...rest] = ranked;
  if (!first) {
    return {
      ...base,
      method: strategy.method,
      pick: null,
      message:
        options.maxTravelMinutes != null
          ? `No suitable events within ${options.maxTravelMinutes} minutes. Try increasing your travel limit.`
          : 'No suitable events found.',
    };
  }

  return {
    ...base,
    method: strategy.method,
    pick: toRecommendation(first),
    alternatives: rest.slice(0, options.alternatives ?? 3).map(toRecommendation),
  };
}
