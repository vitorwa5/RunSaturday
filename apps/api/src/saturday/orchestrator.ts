/**
 * SATURDAY ORCHESTRATOR (Phase 5B): one server-side answer to "Where should I run this
 * Saturday?" for one intent. Home and the Saturday Planner both call it; nothing is ranked in
 * React and there is no second ranking path.
 *
 *   events + visit context ─▶ travel limit ─▶ filters (+ intent defaults) ─▶ intent strategy
 *                                                                          ─▶ why (2–4), data confidence
 *                                                                          ─▶ best match + alternatives
 *
 * Every strategy REUSES a validated engine; none is reimplemented:
 *   pb          PB Score ranking (rankEvents)            + Course Speed Factor, Current Form equivalent
 *   place       Current Form → placement engine (rankingContext / rankEvents)
 *   new_event   unvisited only (visits from UserPerformance), reliable data first, nearest
 *   challenge   Challenge Engine opportunities (eventsMatching), nearest first
 *   quiet       median field size from stored occurrences (last 90 days), reliable first
 *   hidden_gem  Hidden Gem V1 ranking (rankHiddenGems via rankingContext), unchanged order
 *   surprise    deterministic shortlist rotation (see `surprise` below), never Math.random
 *
 * There is deliberately NO universal Saturday Score: each intent ranks by what it cares about.
 */
import {
  formatFinishTime,
  goalDefinition,
  type ConfidenceLevel,
  type DataConfidenceNote,
  type EventSummary,
  type Goal,
  type PlannerFilters,
  type Recommendation,
  type SaturdayChallengeContext,
} from '@runsaturday/shared';
import { eventsMatching, findChallenge, helpsWith } from '../challenges/engine';
import { windowStart } from '../domain/confidence';
import type { DataStore, UserRecord } from '../repositories/DataStore';
import { withContext } from '../services/eventContext';
import { loadExploreState, type ExploreState } from '../services/explore';
import { matchesFilters } from '../services/plannerFilters';
import { abilityNote, rankingContext, type RankingContext } from '../services/rankingContext';
import { explain, highlights, rankEvents } from '../services/recommendations';
import { formReferenceOf } from '../services/runnerForm';
import type { Coordinates } from '../services/travel';

export const SATURDAY_V1 = {
  /** Quiet: field sizes come from the last 90 days of stored occurrences. */
  QUIET_WINDOW_DAYS: 90,
  /** Quiet: at least this many events with a field size for a reliable "typical" figure. */
  QUIET_MIN_EVENTS: 6,
  /** Surprise me: travel within this share of the limit counts as "shorter travel". */
  SURPRISE_NEAR_SHARE: 0.5,
  /** Surprise me: a Gem Score at least this high is a "hidden gem" signal. */
  SURPRISE_GEM_SCORE: 60,
  /** Default number of alternatives next to the best match. */
  ALTERNATIVES: 3,
} as const;

export interface SaturdayRequest {
  intent: Goal;
  date: string;
  today: string;
  maxTravelMinutes: number;
  filters: PlannerFilters;
  origin: Coordinates | null;
  challenge?: { id?: string | undefined; item?: string | undefined };
  /** Surprise me: which rotation of the shortlist to show ("show me another"). */
  offset?: number;
  alternatives?: number;
}

export interface SaturdayResult {
  intent: Goal;
  method: string;
  results: Recommendation[];
  bestPick: Recommendation | null;
  alternatives: Recommendation[];
  counts: { total: number; withinTravel: number; matchingFilters: number };
  defaultsApplied: string[];
  challenge: SaturdayChallengeContext | null;
  limitations: string[];
  exclusions: string[];
  surprise: { offset: number; shortlist: number } | null;
  ability: { usesCurrentForm: boolean; formReference: ReturnType<typeof formReferenceOf>; note: string };
  /** Why there are no results, when there are none. */
  message?: string;
}

const CONFIDENCE_LABEL: Record<ConfidenceLevel, string> = {
  high: 'High data confidence',
  medium: 'Medium data confidence',
  low: 'Low data confidence',
  insufficient: 'Limited data',
};
const note = (level: ConfidenceLevel, basis: string): DataConfidenceNote => ({ level, label: CONFIDENCE_LABEL[level], basis });

/** 2–4 concise reasons: intent-specific first, then generic fillers, de-duplicated. */
function why(specific: (string | null | false | undefined)[], e: EventSummary, maxTravel: number): string[] {
  const out = [...new Set(specific.filter((s): s is string => typeof s === 'string' && s.length > 0))];
  const fillers = [e.travel ? (e.travel.minutes <= maxTravel / 2 ? `Shorter travel (about ${e.travel.minutes} min, estimated)` : `About ${e.travel.minutes} min away (estimated)`) : null, e.favourite ? 'Favourite' : null];
  for (const f of fillers) if (out.length < 2 && f && !out.includes(f)) out.push(f);
  return out.slice(0, 4);
}

const travelReason = (e: EventSummary, maxTravel: number) =>
  e.travel ? (e.travel.minutes <= maxTravel / 2 ? `Shorter travel (about ${e.travel.minutes} min, estimated)` : `About ${e.travel.minutes} min away (estimated)`) : null;

const helpsText = (state: ExploreState | null, e: EventSummary) =>
  state ? helpsWith(e, state.challenges).map((h) => `Completes ${h.challengeName.replace(/ Challenge$/, '')} — ${h.itemLabel}`) : [];

const courseText = (e: EventSummary) => {
  const parts = [e.surface !== 'unknown' ? e.surface[0]!.toUpperCase() + e.surface.slice(1) : null, e.laps != null ? (e.laps >= 3 ? '3+ laps' : `${e.laps} lap${e.laps === 1 ? '' : 's'}`) : null];
  return parts.filter(Boolean).join(', ');
};

/** FNV-1a: a small, stable string hash for the Surprise me rotation. */
export function stableHash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

/** Median field size over the window, from the stored occurrence summary (never Result rows). */
async function typicalField(store: DataStore, eventId: string, today: string) {
  const from = windowStart(today, SATURDAY_V1.QUIET_WINDOW_DAYS)!;
  const sizes = (await store.listOccurrences(eventId))
    .filter((o) => o.status === 'completed' && o.participantCount != null && o.date >= from && o.date <= today)
    .map((o) => o.participantCount!)
    .sort((a, b) => a - b);
  if (sizes.length === 0) return null;
  const mid = Math.floor(sizes.length / 2);
  const median = sizes.length % 2 ? sizes[mid]! : Math.round((sizes[mid - 1]! + sizes[mid]!) / 2);
  return { median, events: sizes.length };
}

const quietConfidence = (n: number): ConfidenceLevel => (n >= 8 ? 'high' : n >= SATURDAY_V1.QUIET_MIN_EVENTS ? 'medium' : n >= 3 ? 'low' : 'insufficient');

export async function orchestrateSaturday(store: DataStore, user: UserRecord | null, req: SaturdayRequest): Promise<SaturdayResult> {
  const { intent, maxTravelMinutes: maxTravel } = req;
  const events = withContext(await store.listActiveEvents(), req.origin, user);
  const withinTravel = req.origin ? events.filter((e) => e.travel && e.travel.minutes <= maxTravel) : [];
  const defaultsApplied: string[] = [];
  const limitations: string[] = [];
  const exclusions: string[] = [];

  // Intent defaults: set sensible constraints without locking the user out of their filters.
  const filters = { ...req.filters };
  let conflict: string | null = null;
  if (intent === 'new_event') {
    if (filters.visited === 'visited') conflict = 'Visit somewhere new only shows events you have not visited, but the Visited filter keeps only events you have. Change one of them.';
    filters.visited = 'not_visited';
    defaultsApplied.push('Only events you have not visited');
  }
  const matching = conflict ? [] : withinTravel.filter((e) => matchesFilters(e, filters));
  const explore = user ? await loadExploreState(store, user.id, req.today) : null;
  const context = await rankingContext(store, user, intent, matching, { maxTravelMinutes: maxTravel, today: req.today });
  const form = user ? formReferenceOf(user.currentForm) : null;

  let ranked: Recommendation[] = [];
  let method: string = goalDefinition(intent).strategy;
  let challenge: SaturdayChallengeContext | null = null;
  let surprise: SaturdayResult['surprise'] = null;
  let message: string | undefined;

  switch (intent) {
    case 'pb': {
      const r = rankEvents('pb', matching, maxTravel);
      method = r.method;
      // "One of the faster courses": fastest third of the analysed cohort by Course Speed Factor.
      const factors = events.map((e) => e.scores?.courseSpeedFactor).filter((f): f is number => f != null).sort((a, b) => a - b);
      const fastThird = factors[Math.max(0, Math.ceil(factors.length / 3) - 1)];
      if (!form) limitations.push('Current Form unavailable: the course ranking is unchanged, but no Current Form equivalents are shown.');
      ranked = r.results.map((rec) => {
        const e = rec.event;
        const s = e.scores;
        const f = s?.courseSpeedFactor ?? null;
        return {
          ...rec,
          why: why(
            [
              f != null && fastThird != null && f <= fastThird ? 'Historically one of the faster courses in the analysed cohort' : f != null && f < 1 ? 'Historically faster than the cohort reference' : null,
              s?.pbScore != null && s.pbScore >= 65 ? `${s.pbScore >= 85 ? 'Strong' : 'Good'} PB Score (${Math.round(s.pbScore)}/100)` : null,
              e.elevationM != null && e.elevationM < 25 ? `Flat (${e.elevationM} m elevation)` : null,
              form && f != null ? `Your Current Form ≈ ${formatFinishTime(form.formSeconds)} equates to ≈ ${formatFinishTime(Math.round(form.formSeconds * f))} here` : null,
            ],
            e,
            maxTravel,
          ),
          dataConfidence: note(s?.pbConfidence ?? 'insufficient', 'Course speed from runners who ran here and elsewhere'),
        };
      });
      break;
    }
    case 'place': {
      const r = rankEvents('place', matching, maxTravel, context);
      method = r.method;
      if (!context.place) limitations.push('Current Form unavailable: ranked by lowest Competition Score instead. Your Overall 5K PB is not used as current ability.');
      ranked = r.results.map((rec) => {
        const e = rec.event;
        const p = context.place?.get(e.id);
        return {
          ...rec,
          why: why(
            [
              p ? `Historically, your Current Form would have placed in the top 10 at ${p.frequency.count} of the last ${p.frequency.of} analysed events` : null,
              !p && e.scores?.competitionScore != null ? `Lower historical competition (${Math.round(e.scores.competitionScore)}/100)` : null,
              p ? `Equivalent here ≈ ${formatFinishTime(p.equivalentSeconds)} (course-adjusted)` : null,
              e.averageParticipants != null && e.averageParticipants < 150 ? `Small field (about ${e.averageParticipants} runners)` : null,
            ],
            e,
            maxTravel,
          ),
          dataConfidence: p ? note(p.confidence, 'Placement history and course adjustment') : note(e.scores?.competitionConfidence ?? 'insufficient', 'Competition Score history'),
        };
      });
      break;
    }
    case 'new_event': {
      const r = rankEvents('new_event', matching, maxTravel);
      method = r.method;
      ranked = r.results.map((rec) => ({
        ...rec,
        why: why(['New to you', ...helpsText(explore, rec.event), travelReason(rec.event, maxTravel), rec.event.favourite ? 'Favourite' : null, courseText(rec.event) || null], rec.event, maxTravel),
        dataConfidence: null,
      }));
      break;
    }
    case 'challenge': {
      const results = explore?.challenges ?? [];
      const chosen = (req.challenge?.id ? results.find((c) => c.id === req.challenge!.id) : null) ?? results.find((c) => c.status === 'in_progress') ?? results.find((c) => c.status !== 'completed') ?? results[0] ?? null;
      if (!chosen) {
        message = 'No challenges yet.';
        break;
      }
      const def = findChallenge(chosen.id)!;
      const missing = chosen.items.filter((i) => !i.completed);
      const item = req.challenge?.item && missing.some((i) => i.key === req.challenge!.item) ? req.challenge.item : null;
      challenge = {
        challengeId: chosen.id,
        challengeName: chosen.name,
        progress: chosen.progress,
        itemKey: item,
        missingItems: missing.map((i) => ({ key: i.key, label: i.label, opportunities: i.opportunities.length })),
        challenges: results.map((c) => ({ id: c.id, name: c.name, status: c.status })),
      };
      if (req.challenge?.item && !item) {
        message = chosen.completedItems.includes(req.challenge.item) ? `You have already completed ${req.challenge.item}.` : `${req.challenge.item} is not part of the ${chosen.name}.`;
        break;
      }
      const keys = item ? [item] : missing.map((i) => i.key);
      const inDataset = new Set(keys.flatMap((k) => eventsMatching(def, k, events).map((e) => e.id)));
      const candidates = matching.filter((e) => inDataset.has(e.id));
      if (inDataset.size === 0) {
        message = item ? `No event in the current 5K Compass dataset completes ${item}. More events may be added later.` : `No event in the current 5K Compass dataset completes a missing item of the ${chosen.name}.`;
        break;
      }
      const hidden = inDataset.size - candidates.length;
      if (hidden > 0) exclusions.push(`${hidden} matching ${hidden === 1 ? 'event is' : 'events are'} beyond ${maxTravel} min or outside your filters.`);
      method = item ? `events that complete ${item}, nearest first` : `events that complete a missing item, nearest first`;
      ranked = [...candidates]
        .sort((a, b) => (a.travel?.minutes ?? Infinity) - (b.travel?.minutes ?? Infinity) || a.name.localeCompare(b.name))
        .map((e, i) => {
          const completes = keys.filter((k) => eventsMatching(def, k, [e]).length > 0);
          return {
            rank: i + 1,
            event: e,
            rankedBy: { key: 'travel_minutes', label: 'Estimated travel', unit: 'min', direction: 'lower_is_better', value: e.travel?.minutes ?? null },
            highlights: highlights(e, 'challenge'),
            reasons: explain(e, 'challenge', maxTravel),
            why: why([...completes.map((k) => `Completes ${chosen.name.replace(/ Challenge$/, '')} — ${k}`), e.visited === false ? 'New to you' : null, travelReason(e, maxTravel), e.favourite ? 'Favourite' : null], e, maxTravel),
            dataConfidence: null,
          } satisfies Recommendation;
        });
      break;
    }
    case 'quiet': {
      const fields = new Map(await Promise.all(matching.map(async (e) => [e.id, await typicalField(store, e.id, req.today)] as const)));
      const unknown = matching.filter((e) => fields.get(e.id) == null).length;
      if (unknown > 0) exclusions.push(`${unknown} ${unknown === 1 ? 'event has' : 'events have'} no field sizes in the last ${SATURDAY_V1.QUIET_WINDOW_DAYS} days.`);
      limitations.push('Field sizes are historical; attendance on Saturday can differ.');
      method = `median field size over the last ${SATURDAY_V1.QUIET_WINDOW_DAYS} days; events with fewer than ${SATURDAY_V1.QUIET_MIN_EVENTS} recorded events rank after reliable ones`;
      const reliable = (id: string) => (fields.get(id)?.events ?? 0) >= SATURDAY_V1.QUIET_MIN_EVENTS;
      ranked = matching
        .filter((e) => fields.get(e.id) != null)
        .sort((a, b) => Number(reliable(b.id)) - Number(reliable(a.id)) || fields.get(a.id)!.median - fields.get(b.id)!.median || a.name.localeCompare(b.name))
        .map((e, i) => {
          const f = fields.get(e.id)!;
          return {
            rank: i + 1,
            event: e,
            rankedBy: { key: 'typical_participants', label: 'Typical runners', direction: 'lower_is_better', value: f.median },
            highlights: highlights(e, 'quiet'),
            reasons: explain(e, 'quiet', maxTravel),
            why: why(
              [
                `Typically around ${f.median} runners (median of ${f.events} events, last ${SATURDAY_V1.QUIET_WINDOW_DAYS} days)`,
                reliable(e.id) ? null : `Only ${f.events} recent ${f.events === 1 ? 'event' : 'events'}: field size less certain`,
                travelReason(e, maxTravel),
              ],
              e,
              maxTravel,
            ),
            dataConfidence: note(quietConfidence(f.events), `Field sizes from ${f.events} recent ${f.events === 1 ? 'event' : 'events'}`),
          } satisfies Recommendation;
        });
      break;
    }
    case 'hidden_gem': {
      // Hidden Gem V1, unchanged: same components, weights and order as the Hidden Gems tool.
      method = 'ranked using Gem Score (hidden_gem_v1)';
      ranked = (context.gems ?? []).map((g) => ({
        rank: g.rank,
        event: g.event,
        rankedBy: { key: 'gem_score', label: 'Gem score', outOf: 100, direction: 'higher_is_better', value: g.gemScore },
        highlights: highlights(g.event, 'hidden_gem'),
        reasons: g.reasons,
        why: why(
          g.reasons.filter((r) => r.tone === 'positive').map((r) => r.text),
          g.event,
          maxTravel,
        ),
        dataConfidence: note(g.event.scores?.pbConfidence ?? 'insufficient', 'Reliability of the event data'),
      }));
      break;
    }
    case 'surprise': {
      ({ ranked, surprise } = surpriseMe(matching, { context, explore, maxTravel, seed: `${user?.id ?? 'anonymous'}|${req.date}`, offset: req.offset ?? 0 }));
      method = 'a balanced, deterministic pick from the events with the most interest signals; changes from Saturday to Saturday';
      break;
    }
  }

  const n = req.alternatives ?? SATURDAY_V1.ALTERNATIVES;
  if (!message) {
    if (!req.origin) message = 'Choose a starting point to see events near you.';
    else if (conflict) message = conflict;
    else if (withinTravel.length === 0) message = `No events within ${maxTravel} minutes. Try a longer travel limit.`;
    else if (matching.length === 0) message = 'No events match these filters.';
    else if (ranked.length === 0) message = 'No events suit this goal with the current settings.';
  }
  const shown = req.origin && !conflict ? ranked : [];
  return {
    intent,
    method,
    results: shown,
    bestPick: shown[0] ?? null,
    alternatives: shown.slice(1, 1 + n),
    counts: { total: events.length, withinTravel: withinTravel.length, matchingFilters: matching.length },
    defaultsApplied,
    challenge,
    limitations,
    exclusions,
    surprise,
    ability: { usesCurrentForm: context.form != null, formReference: context.form, note: abilityNote(intent, user, context) },
    ...(message && shown.length === 0 ? { message } : {}),
  };
}

/**
 * SURPRISE ME (deterministic). Reliable events (not limited data) within the constraints get
 * one point per interest signal:
 *   new to you · completes a challenge item · shorter travel (≤ half the limit)
 *   · hidden-gem strength (Gem Score ≥ 60) · distinctive course (trail/grass/mixed, 3+ laps,
 *     ≥ 60 m elevation, or PB Score ≥ 85)
 * The shortlist is every event within one point of the best. The pick rotates through it by a
 * stable hash of (user, Saturday) plus `offset` ("show me another"), so the same inputs always
 * give the same answer, different Saturdays give different ones, and nothing unsuitable is
 * chosen for novelty. No Math.random.
 */
export function surpriseMe(
  events: EventSummary[],
  o: { context: RankingContext; explore: ExploreState | null; maxTravel: number; seed: string; offset: number },
): { ranked: Recommendation[]; surprise: { offset: number; shortlist: number } } {
  const reliable = events.filter((e) => e.scores != null && e.scores.pbConfidence !== 'insufficient');
  const pool = reliable.length > 0 ? reliable : events;
  const scored = pool.map((e) => {
    const s = e.scores;
    const gem = o.context.gemScores?.get(e.id) ?? null;
    const distinctive =
      e.surface === 'trail' || e.surface === 'grass' || e.surface === 'mixed'
        ? `Distinctive course: ${e.surface}`
        : e.laps != null && e.laps >= 3
          ? 'Distinctive course: 3+ laps'
          : e.elevationM != null && e.elevationM >= 60
            ? `Distinctive course: ${e.elevationM} m of climbing`
            : s?.pbScore != null && s.pbScore >= 85
              ? 'Fast course (strong PB Score)'
              : null;
    const signals = [
      e.visited === false ? 'New to you' : null,
      ...helpsText(o.explore, e).slice(0, 1),
      e.travel && e.travel.minutes <= o.maxTravel * SATURDAY_V1.SURPRISE_NEAR_SHARE ? `Shorter travel (about ${e.travel.minutes} min, estimated)` : null,
      gem != null && gem >= SATURDAY_V1.SURPRISE_GEM_SCORE ? `Hidden-gem strength (Gem Score ${gem})` : null,
      distinctive,
    ].filter((x): x is string => x != null);
    return { e, signals };
  });
  const byStrength = [...scored].sort((a, b) => b.signals.length - a.signals.length || a.e.name.localeCompare(b.e.name));
  const top = byStrength[0]?.signals.length ?? 0;
  const shortlist = byStrength.filter((x) => x.signals.length >= Math.max(1, top - 1));
  const rest = byStrength.filter((x) => !shortlist.includes(x));
  const start = shortlist.length ? (stableHash(o.seed) + o.offset) % shortlist.length : 0;
  const ordered = [...shortlist.slice(start), ...shortlist.slice(0, start), ...rest];
  return {
    surprise: { offset: o.offset, shortlist: shortlist.length },
    ranked: ordered.map(({ e, signals }, i) => ({
      rank: i + 1,
      event: e,
      rankedBy: { key: 'interest_signals', label: 'Interest signals', outOf: 5, direction: 'higher_is_better', value: signals.length },
      highlights: highlights(e, 'surprise'),
      reasons: [...signals.map((text) => ({ text, tone: 'positive' as const })), ...explain(e, 'surprise', o.maxTravel)],
      why: why(signals, e, o.maxTravel),
      dataConfidence: note(e.scores?.pbConfidence ?? 'insufficient', 'Reliability of the event data'),
    })),
  };
}
