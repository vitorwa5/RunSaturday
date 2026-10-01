/** Discovery and performance tools: Where Could I Place?, PB Finder, Hidden Gems, Compare. */
import type { FastifyInstance } from 'fastify';
import {
  COMPARE_MAX_EVENTS,
  COMPARE_MIN_EVENTS,
  CONFIDENCE_FILTERS,
  DEFAULT_HISTORY_WINDOW,
  DEFAULT_PLACEMENT_TARGET,
  ELEVATION_FILTERS,
  HIDDEN_GEM_ALGORITHM,
  HIDDEN_GEM_MODES,
  PB_FINDER_SORTS,
  PLACEMENT_TARGETS,
  SURFACE_FILTERS,
  VISITED_FILTERS,
  type CompareResponse,
  type EventPlacement,
  type HiddenGemsResponse,
  type HistoryWindowId,
  type PbFinderResponse,
  type PlacementResponse,
  type PlacementTargetId,
} from '@runsaturday/shared';
import { z } from 'zod';
import { currentUser, resolveOrigin, type RequestContext } from '../http/context';
import { AppError, notFound, parseInput } from '../http/errors';
import { idsOf, OriginQuery, parseTimeParam, TravelOption, WindowParam } from '../http/schemas';
import { bestByMetric } from '../services/comparisonService';
import { withContext } from '../services/eventContext';
import { rankHiddenGems } from '../services/hiddenGemService';
import { pbFinder } from '../services/pbFinderService';
import { computePlacements, rankPlacements } from '../services/placementService';

const FALLBACK_TRAVEL_MINUTES = 45;
const TRAVEL_NOTE = 'Travel times are estimates from straight-line distance, not driving directions.';
const HISTORY_NOTE = 'Placements show where this time would have finished at past events. They are not predictions of who will run next time.';
const DATA_NOTE = 'Only completed events with complete, validated results are used. Cancelled dates are excluded.';

const PlacementQuery = z.object({
  time: z.string(),
  window: WindowParam.default(DEFAULT_HISTORY_WINDOW),
  target: z.enum(idsOf(PLACEMENT_TARGETS)).default(DEFAULT_PLACEMENT_TARGET),
  maxTravel: TravelOption.optional(),
});

const EventPlacementQuery = z.object({ time: z.string(), window: WindowParam.default(DEFAULT_HISTORY_WINDOW) });

const PbFinderQuery = z.object({
  maxTravel: TravelOption.optional(),
  surface: z.enum(idsOf(SURFACE_FILTERS)).default('any'),
  elevation: z.enum(idsOf(ELEVATION_FILTERS)).default('any'),
  confidence: z.enum(idsOf(CONFIDENCE_FILTERS)).default('any'),
  visited: z.enum(idsOf(VISITED_FILTERS)).default('any'),
  sort: z.enum(idsOf(PB_FINDER_SORTS)).default('pb'),
});

const HiddenGemsQuery = z.object({
  mode: z.enum(idsOf(HIDDEN_GEM_MODES)).default('all'),
  maxTravel: TravelOption.optional(),
  time: z.string().optional(),
});

const CompareQuery = z.object({
  ids: z.string().min(1),
  time: z.string().optional(),
  window: WindowParam.default(DEFAULT_HISTORY_WINDOW),
});

export async function toolRoutes(app: FastifyInstance, ctx: RequestContext) {
  /** Events with travel and visit context for the current user. */
  async function contextualEvents(originQuery: { lat?: number | undefined; lon?: number | undefined }) {
    const user = await currentUser(ctx);
    const events = withContext(await ctx.store.listActiveEvents(), resolveOrigin(originQuery, user), user);
    return { user, events };
  }

  app.get('/api/placement', async (request): Promise<PlacementResponse> => {
    const origin = parseInput(OriginQuery, request.query);
    const q = parseInput(PlacementQuery, request.query);
    const timeSeconds = parseTimeParam(q.time);
    const { user, events } = await contextualEvents(origin);
    const maxTravelMinutes = q.maxTravel ?? user?.defaultTravelMinutes ?? FALLBACK_TRAVEL_MINUTES;
    const inRange = events.filter((e) => e.travel && e.travel.minutes <= maxTravelMinutes);

    const { placements, from } = await computePlacements(ctx.store, inRange, {
      timeSeconds,
      window: q.window as HistoryWindowId,
      target: q.target,
      today: ctx.today(),
    });
    const ranked = rankPlacements(placements);
    return {
      timeSeconds,
      window: q.window as HistoryWindowId,
      from,
      to: ctx.today(),
      target: q.target,
      maxTravelMinutes,
      results: ranked,
      eventsWithoutData: placements.length - ranked.length,
      notes: [HISTORY_NOTE, DATA_NOTE, TRAVEL_NOTE],
    };
  });

  app.get('/api/events/:id/placement', async (request): Promise<EventPlacement> => {
    const { id } = parseInput(z.object({ id: z.string().min(1).max(200) }), request.params);
    const q = parseInput(EventPlacementQuery, request.query);
    const timeSeconds = parseTimeParam(q.time);
    const { events } = await contextualEvents({});
    const event = events.find((e) => e.id === id || e.slug === id);
    if (!event) throw notFound('This event');
    const { placements } = await computePlacements(ctx.store, [event], {
      timeSeconds,
      window: q.window as HistoryWindowId,
      target: DEFAULT_PLACEMENT_TARGET,
      today: ctx.today(),
    });
    return placements[0]!;
  });

  app.get('/api/pb-finder', async (request): Promise<PbFinderResponse> => {
    const origin = parseInput(OriginQuery, request.query);
    const { maxTravel, sort, ...filters } = parseInput(PbFinderQuery, request.query);
    const { user, events } = await contextualEvents(origin);
    const maxTravelMinutes = maxTravel ?? user?.defaultTravelMinutes ?? FALLBACK_TRAVEL_MINUTES;
    const { results, counts } = pbFinder(events, { maxTravelMinutes, filters, sort });

    let message: string | undefined;
    if (counts.withinTravel === 0) message = `No events within ${maxTravelMinutes} minutes. Try a longer travel limit.`;
    else if (counts.matching === 0) message = 'No events match these filters.';

    return {
      sort,
      maxTravelMinutes,
      filters,
      results,
      counts,
      ...(message ? { message } : {}),
      notes: ['PB Scores are demo values until the PB Score model is built.', TRAVEL_NOTE],
    };
  });

  app.get('/api/hidden-gems', async (request): Promise<HiddenGemsResponse> => {
    const origin = parseInput(OriginQuery, request.query);
    const q = parseInput(HiddenGemsQuery, request.query);
    const { user, events } = await contextualEvents(origin);
    const maxTravelMinutes = q.maxTravel ?? user?.defaultTravelMinutes ?? FALLBACK_TRAVEL_MINUTES;
    // Placement opportunity uses the runner's current form by default.
    const timeSeconds = q.time != null ? parseTimeParam(q.time) : (user?.current5kEstimateSeconds ?? null);

    const top10ByEvent = new Map<string, { count: number; of: number } | null>();
    if (timeSeconds != null) {
      const inRange = events.filter((e) => e.travel && e.travel.minutes <= maxTravelMinutes);
      const { placements } = await computePlacements(ctx.store, inRange, {
        timeSeconds,
        window: DEFAULT_HISTORY_WINDOW,
        target: 'top10',
        today: ctx.today(),
      });
      // Only use placement history with enough data behind it.
      for (const p of placements) top10ByEvent.set(p.event.id, p.confidence !== 'insufficient' ? (p.stats?.frequencies.top10 ?? null) : null);
    }

    const results = rankHiddenGems(events, { mode: q.mode, maxTravelMinutes, timeSeconds, top10ByEvent });
    return {
      algorithm: HIDDEN_GEM_ALGORITHM,
      mode: q.mode,
      maxTravelMinutes,
      timeSeconds,
      results,
      ...(results.length === 0 ? { message: 'No events match this mode within your travel limit.' } : {}),
      notes: [
        'Gem Score is a 5K Compass ranking (hidden_gem_v1), not an official parkrun metric.',
        timeSeconds != null
          ? 'Placement opportunity uses how your current form would historically have placed in the last 90 days.'
          : 'Placement opportunity uses the inverse of each Competition Score.',
        TRAVEL_NOTE,
      ],
    };
  });

  app.get('/api/compare', async (request): Promise<CompareResponse> => {
    const q = parseInput(CompareQuery, request.query);
    const ids = [...new Set(q.ids.split(',').map((s) => s.trim()).filter(Boolean))];
    if (ids.length < COMPARE_MIN_EVENTS) throw new AppError(400, 'too_few_events', `Choose at least ${COMPARE_MIN_EVENTS} events to compare.`);
    if (ids.length > COMPARE_MAX_EVENTS) throw new AppError(400, 'too_many_events', `Compare up to ${COMPARE_MAX_EVENTS} events at a time.`);

    const timeSeconds = q.time != null ? parseTimeParam(q.time) : null;
    const { events } = await contextualEvents({});
    const found = ids.map((id) => events.find((e) => e.id === id || e.slug === id) ?? null);
    const selected = found.filter((e): e is NonNullable<typeof e> => e != null);
    const missing = ids.filter((_, i) => found[i] == null);

    let placementById = new Map<string, EventPlacement>();
    if (timeSeconds != null && selected.length > 0) {
      const { placements } = await computePlacements(ctx.store, selected, {
        timeSeconds,
        window: q.window as HistoryWindowId,
        target: 'top10' as PlacementTargetId,
        today: ctx.today(),
      });
      placementById = new Map(placements.map((p) => [p.event.id, p]));
    }

    const rows = selected.map((event) => ({ event, placement: placementById.get(event.id) ?? null }));
    return { events: rows, missing, timeSeconds, window: q.window as HistoryWindowId, best: bestByMetric(rows) };
  });
}
