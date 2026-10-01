/**
 * HIDDEN GEM V1 (hidden_gem_v1). A transparent ranking from stored data, not an official
 * parkrun metric.
 *
 *   gemScore = 0.35 × placement opportunity
 *            + 0.25 × low participant count
 *            + 0.15 × travel convenience
 *            + 0.15 × reliability (data confidence)
 *            + 0.10 × not previously visited
 *
 * Every component is normalised to 0–100 first, and the breakdown is returned with each
 * result. Unknown inputs score 0 for that component, so missing data never inflates a gem.
 */
import {
  formatFinishTime,
  type ConfidenceLevel,
  type EventSummary,
  type HiddenGem,
  type HiddenGemComponent,
  type HiddenGemModeId,
  type HistoricalFrequency,
  type RecommendationReason,
} from '@runsaturday/shared';


export const HIDDEN_GEM_V1_WEIGHTS = {
  placement_opportunity: 0.35,
  low_participants: 0.25,
  travel_convenience: 0.15,
  reliability: 0.15,
  not_visited: 0.1,
} as const satisfies Record<HiddenGemComponent['key'], number>;

/** Average-runner bounds for the low-participant scale: ≤ 50 → 100, ≥ 500 → 0. */
export const PARTICIPANT_BOUNDS = { small: 50, large: 500 } as const;

const RELIABILITY: Record<ConfidenceLevel, number> = { high: 100, medium: 70, low: 40, insufficient: 10 };

const clamp = (v: number) => Math.min(100, Math.max(0, v));
/** Weight in whole percent, so arithmetic stays exact (0.15 × 67 is 10.0499… in floating point). */
const percent = (weight: number) => Math.round(weight * 100);
/** value × weight rounded half up to 0.1, computed in integer tenths. */
const contributionOf = (value: number, weight: number) => Math.round((value * percent(weight)) / 10) / 10;

export interface GemContext {
  maxTravelMinutes: number;
  /** Runner's historical Top-10 frequency at this event, when a runner time is known and data suffices. */
  top10: HistoricalFrequency | null;
  timeSeconds: number | null;
}

export function gemComponents(e: EventSummary, ctx: GemContext): HiddenGemComponent[] {
  const s = e.scores;
  const make = (key: HiddenGemComponent['key'], label: string, value: number, basis: string): HiddenGemComponent => {
    const v = Math.round(clamp(value));
    return { key, label, weight: HIDDEN_GEM_V1_WEIGHTS[key], value: v, contribution: contributionOf(v, HIDDEN_GEM_V1_WEIGHTS[key]), basis };
  };

  let placement: HiddenGemComponent;
  if (ctx.top10 && ctx.top10.of > 0 && ctx.timeSeconds != null) {
    placement = make(
      'placement_opportunity',
      'Placement opportunity',
      (100 * ctx.top10.count) / ctx.top10.of,
      `Top 10 in ${ctx.top10.count} of ${ctx.top10.of} recent events at ${formatFinishTime(ctx.timeSeconds)}`,
    );
  } else if (s?.competitionScore != null) {
    placement = make('placement_opportunity', 'Placement opportunity', 100 - s.competitionScore, `Inverse of Competition Score (${Math.round(s.competitionScore)}/100)`);
  } else {
    placement = make('placement_opportunity', 'Placement opportunity', 0, 'Unknown (scored 0)');
  }

  const n = e.averageParticipants;
  const participants =
    n == null
      ? make('low_participants', 'Small field', 0, 'Average runners unknown (scored 0)')
      : make(
          'low_participants',
          'Small field',
          (100 * (PARTICIPANT_BOUNDS.large - n)) / (PARTICIPANT_BOUNDS.large - PARTICIPANT_BOUNDS.small),
          `About ${n} runners on average`,
        );

  const travel = e.travel
    ? make('travel_convenience', 'Travel convenience', 100 * (1 - e.travel.minutes / ctx.maxTravelMinutes), `About ${e.travel.minutes} of ${ctx.maxTravelMinutes} min (estimated)`)
    : make('travel_convenience', 'Travel convenience', 0, 'Travel unknown (scored 0)');

  const level = s?.pbConfidence ?? 'insufficient';
  const reliability = make('reliability', 'Reliability', RELIABILITY[level], `${level === 'insufficient' ? 'Limited' : level[0]!.toUpperCase() + level.slice(1)} data confidence`);

  const visited =
    e.visited == null
      ? make('not_visited', 'New to you', 0, 'Visit history unknown (scored 0)')
      : make('not_visited', 'New to you', e.visited ? 0 : 100, e.visited ? 'You have run here' : 'Not visited yet');

  return [placement, participants, travel, reliability, visited];
}

export const gemScore = (components: HiddenGemComponent[]) =>
  Math.round(components.reduce((sum, c) => sum + c.value * percent(c.weight), 0) / 100);

const MODE_FILTERS: Record<HiddenGemModeId, (e: EventSummary, components: HiddenGemComponent[]) => boolean> = {
  all: () => true,
  quiet: (e) => e.averageParticipants != null && e.averageParticipants < 200,
  easier_to_place: (_e, c) => c.find((x) => x.key === 'placement_opportunity')!.value >= 50,
  fast: (e) => e.scores?.pbScore != null && e.scores.pbScore >= 80,
  small_field: (e) => e.averageParticipants != null && e.averageParticipants < 120,
  not_visited: (e) => e.visited === false,
};

/** "Why it's a gem": plain statements of the stored facts behind the score. */
export function gemReasons(e: EventSummary, ctx: GemContext): RecommendationReason[] {
  const reasons: RecommendationReason[] = [];
  const add = (text: string, tone: RecommendationReason['tone'] = 'positive') => reasons.push({ text, tone });
  const s = e.scores;
  if (e.averageParticipants != null && e.averageParticipants < 150) add(`Small field (about ${e.averageParticipants} runners)`);
  if (e.averageParticipants != null && e.averageParticipants >= 300) add(`Larger field (about ${e.averageParticipants} runners)`, 'caution');
  if (s?.competitionScore != null && s.competitionScore < 45) add(`Lower historical competition (${Math.round(s.competitionScore)}/100)`);
  if (ctx.top10 && ctx.top10.count > 0 && ctx.timeSeconds != null)
    add(`Historically top 10 in ${ctx.top10.count} of ${ctx.top10.of} events at ${formatFinishTime(ctx.timeSeconds)}`);
  if (s?.pbScore != null && s.pbScore >= 85) add(`Fast course (PB Score ${Math.round(s.pbScore)})`);
  if (s?.pbConfidence === 'high') add(`High data confidence (${s.sampleSize} events)`);
  if (!s || s.pbConfidence === 'insufficient') add(`Limited data: only ${s?.sampleSize ?? 0} recent events`, 'caution');
  if (e.travel && e.travel.minutes <= 20) add(`Close to home (about ${e.travel.minutes} min, estimated)`);
  if (e.visited === false) add('Not visited yet');
  return reasons;
}

/** Rank gems within travel for a mode. Deterministic: ties broken alphabetically. */
export function rankHiddenGems(
  events: EventSummary[],
  options: { mode: HiddenGemModeId; maxTravelMinutes: number; timeSeconds: number | null; top10ByEvent: Map<string, HistoricalFrequency | null> },
): HiddenGem[] {
  return events
    .filter((e) => e.travel && e.travel.minutes <= options.maxTravelMinutes)
    .map((e) => {
      const ctx: GemContext = { maxTravelMinutes: options.maxTravelMinutes, timeSeconds: options.timeSeconds, top10: options.top10ByEvent.get(e.id) ?? null };
      const components = gemComponents(e, ctx);
      return { event: e, components, gemScore: gemScore(components), reasons: gemReasons(e, ctx) };
    })
    .filter((g) => MODE_FILTERS[options.mode](g.event, g.components))
    .sort((a, b) => b.gemScore - a.gemScore || a.event.name.localeCompare(b.event.name))
    .map((g, i) => ({ rank: i + 1, ...g }));
}
