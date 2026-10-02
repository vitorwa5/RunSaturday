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
  type CourseAdjustment,
  type EventPlacement,
  type EventSummary,
  type FormReference,
  type HiddenGemsResponse,
  type HistoryWindowId,
  type PbFinderResponse,
  type PlacementMode,
  type PlacementResponse,
  type PlacementTargetId,
} from '@runsaturday/shared';
import { z } from 'zod';
import { CURRENT_USER_ID, currentUser, resolveOrigin, type RequestContext } from '../http/context';
import { currentRunnerForm, formReferenceOf, formUnavailableNote } from '../services/runnerForm';
import { AppError, notFound, parseInput } from '../http/errors';
import { idsOf, OriginQuery, parseTimeParam, TravelOption, WindowParam } from '../http/schemas';
import { bestByMetric } from '../services/comparisonService';
import { windowFrom } from '../domain/windows';
import { withContext } from '../services/eventContext';
import { rankHiddenGems } from '../services/hiddenGemService';
import { pbFinder } from '../services/pbFinderService';
import { ADJUSTMENT_UNAVAILABLE, isReliableFactor } from '../services/courseAdjustment';
import { computeAdjustedPlacements, computePlacements, rankPlacements } from '../services/placementService';

const FALLBACK_TRAVEL_MINUTES = 45;
const TRAVEL_NOTE = 'Travel times are estimates from straight-line distance, not driving directions.';
const HISTORY_NOTE = 'Placements show where this time would have finished at past events. They are not predictions of who will run next time.';
const DATA_NOTE = 'Only completed events with complete, validated results are used. Cancelled dates are excluded.';
/** Every auto-mode fallback to raw time is labelled with this, so it is never mistaken for an adjusted result. */
const RAW_FALLBACK = 'Raw time comparison — course adjustment unavailable';
const ADJUSTED_NOTE =
  'Course adjusted: your time is converted to an equivalent at each course using Course Speed Factors from matched runners, then compared with past results. Equivalent times are historical conversions, not predicted finish times.';

/**
 * basis=current_form: analyse the runner's Current Form (read from their own snapshot on the
 * server; `time` and `source` are then ignored). basis=time (default): the given time.
 */
const BasisParam = z.enum(['time', 'current_form']).default('time');
const FORM_NOTE =
  'Current Form estimates your present 5K capability from your strongest supported recent performances, adjusted for course differences. Each equivalent is your Current Form converted to that course: an equivalent performance from past results, not a predicted finish time.';

/** auto: course adjusted when a source event with a reliable factor is given, otherwise raw time. */
const ModeParam = z.enum(['auto', 'adjusted', 'raw']).default('auto');
const SourceParam = z.string().min(1).max(200).optional();

const PlacementQuery = z.object({
  time: z.string().optional(),
  basis: BasisParam,
  window: WindowParam.default(DEFAULT_HISTORY_WINDOW),
  target: z.enum(idsOf(PLACEMENT_TARGETS)).default(DEFAULT_PLACEMENT_TARGET),
  maxTravel: TravelOption.optional(),
  mode: ModeParam,
  source: SourceParam,
});

const EventPlacementQuery = z.object({
  time: z.string().optional(),
  basis: BasisParam,
  window: WindowParam.default(DEFAULT_HISTORY_WINDOW),
  mode: ModeParam,
  source: SourceParam,
});

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
  basis: BasisParam,
  window: WindowParam.default(DEFAULT_HISTORY_WINDOW),
  mode: ModeParam,
  source: SourceParam,
});

export async function toolRoutes(app: FastifyInstance, ctx: RequestContext) {
  /** Events with travel and visit context for the current user. */
  async function contextualEvents(originQuery: { lat?: number | undefined; lon?: number | undefined }) {
    const user = await currentUser(ctx);
    const events = withContext(await ctx.store.listActiveEvents(), resolveOrigin(originQuery, user), user);
    return { user, events };
  }

  /** The time to analyse: the given time, or the user's Current Form (never a client-supplied form). */
  async function resolveBasis(q: { basis: 'time' | 'current_form'; time?: string | undefined }): Promise<{ timeSeconds: number; form: FormReference | null }> {
    if (q.basis === 'time') return { timeSeconds: parseTimeParam(q.time), form: null };
    const form = await currentRunnerForm(ctx.store, CURRENT_USER_ID, ctx.today());
    const ref = formReferenceOf(form);
    if (!ref) throw new AppError(409, 'form_unavailable', formUnavailableNote(form));
    return { timeSeconds: ref.formSeconds, form: ref };
  }

  /**
   * Placements in raw or course-adjusted mode. "auto" adjusts when a source event with a
   * reliable Course Speed Factor is given and says why when it cannot; an explicit "adjusted"
   * request never falls back to raw silently.
   */
  async function placementsFor(
    all: EventSummary[],
    selected: EventSummary[],
    q: {
      timeSeconds: number;
      form?: FormReference | null;
      mode: 'auto' | 'adjusted' | 'raw';
      source?: string | undefined;
      window: HistoryWindowId;
      target: PlacementTargetId;
    },
  ): Promise<{
    mode: PlacementMode;
    modeNote: string | null;
    source: PlacementResponse['source'];
    formReference: FormReference | null;
    placements: EventPlacement[];
    unavailable: CourseAdjustment[];
    from: string | null;
  }> {
    const base = { window: q.window, target: q.target, today: ctx.today() };
    const formReference = q.form ?? null;
    const raw = async (modeNote: string | null, source: PlacementResponse['source'] = null) => {
      const { placements, from } = await computePlacements(ctx.store, selected, { ...base, timeSeconds: q.timeSeconds });
      return { mode: 'raw' as const, modeNote, source, formReference, placements, unavailable: [], from };
    };
    if (q.mode === 'raw') return raw(null);
    if (formReference) {
      // Current Form is already on the course-reference scale: equivalent = form × target factor. No source event.
      const factors = new Map((await ctx.store.listCourseFactors()).map((f) => [f.eventId, f]));
      const result = await computeAdjustedPlacements(ctx.store, selected, { ...base, form: formReference, factors });
      return { mode: 'adjusted', modeNote: null, source: null, formReference, ...result };
    }
    if (q.source == null) {
      if (q.mode === 'adjusted') throw new AppError(400, 'source_required', 'Course adjustment requires a source event: choose where the time was achieved.');
      // An event-less time (e.g. an estimated current form) is never treated as if run at a reference course.
      return raw(`${RAW_FALLBACK}: no source event is known for this time.`);
    }
    const sourceEvent = all.find((e) => e.id === q.source || e.slug === q.source);
    if (!sourceEvent) throw notFound('The event where the time was achieved');

    const factors = new Map((await ctx.store.listCourseFactors()).map((f) => [f.eventId, f]));
    const sourceFactor = factors.get(sourceEvent.id);
    const source = {
      eventId: sourceEvent.id,
      name: sourceEvent.name,
      factor: sourceFactor?.factor ?? null,
      confidence: sourceFactor?.confidence.level ?? ('insufficient' as const),
    };
    if (!isReliableFactor(sourceFactor)) {
      const note = `${ADJUSTMENT_UNAVAILABLE} at ${sourceEvent.name}.`;
      if (q.mode === 'auto') return raw(`${RAW_FALLBACK}: limited matched-runner data at ${sourceEvent.name}.`, source);
      return { mode: 'adjusted', modeNote: `${note} Switch to Raw time to compare the time unchanged.`, source, formReference, placements: [], unavailable: [], from: windowFrom(q.window, ctx.today()) };
    }
    const result = await computeAdjustedPlacements(ctx.store, selected, {
      ...base,
      source: { eventId: sourceEvent.id, name: sourceEvent.name, seconds: q.timeSeconds },
      factors,
    });
    return { mode: 'adjusted', modeNote: null, source, formReference, ...result };
  }

  app.get('/api/placement', async (request): Promise<PlacementResponse> => {
    const origin = parseInput(OriginQuery, request.query);
    const q = parseInput(PlacementQuery, request.query);
    const { timeSeconds, form } = await resolveBasis(q);
    const { user, events } = await contextualEvents(origin);
    const maxTravelMinutes = q.maxTravel ?? user?.defaultTravelMinutes ?? FALLBACK_TRAVEL_MINUTES;
    const inRange = events.filter((e) => e.travel && e.travel.minutes <= maxTravelMinutes);

    const { mode, modeNote, source, formReference, placements, unavailable, from } = await placementsFor(events, inRange, {
      timeSeconds,
      form,
      mode: q.mode,
      source: q.source,
      window: q.window as HistoryWindowId,
      target: q.target,
    });
    const ranked = rankPlacements(placements);
    const names = new Map(events.map((e) => [e.id, e.name]));
    return {
      mode,
      modeNote,
      source,
      formReference,
      unavailable: unavailable.map((a) => ({ eventId: a.targetEventId, name: names.get(a.targetEventId) ?? a.targetEventId, reason: a.reason ?? ADJUSTMENT_UNAVAILABLE })),
      timeSeconds,
      window: q.window as HistoryWindowId,
      from,
      to: ctx.today(),
      target: q.target,
      maxTravelMinutes,
      results: ranked,
      eventsWithoutData: placements.length - ranked.length,
      notes: [...(formReference && mode === 'adjusted' ? [FORM_NOTE] : mode === 'adjusted' ? [ADJUSTED_NOTE] : []), HISTORY_NOTE, DATA_NOTE, TRAVEL_NOTE],
    };
  });

  app.get('/api/events/:id/placement', async (request): Promise<EventPlacement> => {
    const { id } = parseInput(z.object({ id: z.string().min(1).max(200) }), request.params);
    const q = parseInput(EventPlacementQuery, request.query);
    const { events } = await contextualEvents({});
    const event = events.find((e) => e.id === id || e.slug === id);
    if (!event) throw notFound('This event');
    const { timeSeconds, form } = await resolveBasis(q);
    const result = await placementsFor(events, [event], {
      timeSeconds,
      form,
      mode: q.mode,
      source: q.source,
      window: q.window as HistoryWindowId,
      target: DEFAULT_PLACEMENT_TARGET,
    });
    if (result.placements[0]) return result.placements[0];
    // Adjustment not possible here: the raw-time placement, carrying the reason (shown to the user).
    const { placements } = await computePlacements(ctx.store, [event], {
      timeSeconds,
      window: q.window as HistoryWindowId,
      target: DEFAULT_PLACEMENT_TARGET,
      today: ctx.today(),
    });
    const adjustment =
      result.unavailable[0] ??
      ({
        available: false,
        reason: ADJUSTMENT_UNAVAILABLE,
        sourceKind: 'event',
        sourceEventId: result.source?.eventId ?? null,
        sourceEventName: result.source?.name ?? '',
        sourceSeconds: timeSeconds,
        targetEventId: event.id,
        equivalentSeconds: null,
        deltaSeconds: null,
        ratio: null,
        sourceFactor: result.source?.factor ?? null,
        targetFactor: null,
        conversionRange: null,
        confidence: 'insufficient',
      } satisfies CourseAdjustment);
    return { ...placements[0]!, adjustment };
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
      notes: [
        'PB Score V1 is 75% observed course speed (Course Speed Factor from matched runners) and 25% structural ease. Competition is not part of it, and your filters never change it.',
        TRAVEL_NOTE,
      ],
    };
  });

  app.get('/api/hidden-gems', async (request): Promise<HiddenGemsResponse> => {
    const origin = parseInput(OriginQuery, request.query);
    const q = parseInput(HiddenGemsQuery, request.query);
    const { user, events } = await contextualEvents(origin);
    const maxTravelMinutes = q.maxTravel ?? user?.defaultTravelMinutes ?? FALLBACK_TRAVEL_MINUTES;
    // Placement opportunity uses an explicit time, else the runner's Current Form converted to each
    // course (events whose course cannot be adjusted get no placement opportunity, not a guess).
    const form = q.time == null && user ? formReferenceOf(user.currentForm) : null;
    const timeSeconds = q.time != null ? parseTimeParam(q.time) : (form?.formSeconds ?? null);

    const top10ByEvent = new Map<string, { count: number; of: number } | null>();
    if (timeSeconds != null) {
      const inRange = events.filter((e) => e.travel && e.travel.minutes <= maxTravelMinutes);
      const options = { window: DEFAULT_HISTORY_WINDOW, target: 'top10' as const, today: ctx.today() };
      const { placements } = form
        ? await computeAdjustedPlacements(ctx.store, inRange, { ...options, form, factors: new Map((await ctx.store.listCourseFactors()).map((f) => [f.eventId, f])) })
        : await computePlacements(ctx.store, inRange, { ...options, timeSeconds });
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
        form
          ? 'Placement opportunity uses how your Current Form, converted to each course, would historically have placed in the last 90 days.'
          : timeSeconds != null
            ? 'Placement opportunity uses how this time would historically have placed in the last 90 days.'
            : `Placement opportunity uses the inverse of each Competition Score${user ? ` (${formUnavailableNote(user.currentForm)})` : ''}.`,
        TRAVEL_NOTE,
      ],
    };
  });

  app.get('/api/compare', async (request): Promise<CompareResponse> => {
    const q = parseInput(CompareQuery, request.query);
    const ids = [...new Set(q.ids.split(',').map((s) => s.trim()).filter(Boolean))];
    if (ids.length < COMPARE_MIN_EVENTS) throw new AppError(400, 'too_few_events', `Choose at least ${COMPARE_MIN_EVENTS} events to compare.`);
    if (ids.length > COMPARE_MAX_EVENTS) throw new AppError(400, 'too_many_events', `Compare up to ${COMPARE_MAX_EVENTS} events at a time.`);

    const { timeSeconds, form } = q.basis === 'current_form' || q.time != null ? await resolveBasis(q) : { timeSeconds: null, form: null };
    const { events } = await contextualEvents({});
    const found = ids.map((id) => events.find((e) => e.id === id || e.slug === id) ?? null);
    const selected = found.filter((e): e is NonNullable<typeof e> => e != null);
    const missing = ids.filter((_, i) => found[i] == null);

    let placementById = new Map<string, EventPlacement>();
    let mode: PlacementMode = 'raw';
    let source: CompareResponse['source'] = null;
    if (timeSeconds != null && selected.length > 0) {
      const result = await placementsFor(events, selected, {
        timeSeconds,
        form,
        mode: q.mode,
        source: q.source,
        window: q.window as HistoryWindowId,
        target: 'top10' as PlacementTargetId,
      });
      mode = result.mode;
      source = result.source ? { eventId: result.source.eventId, name: result.source.name } : null;
      placementById = new Map(result.placements.map((p) => [p.event.id, p]));
    }

    const rows = selected.map((event) => ({ event, placement: placementById.get(event.id) ?? null }));
    return { events: rows, missing, timeSeconds, mode, source, formReference: form, window: q.window as HistoryWindowId, best: bestByMetric(rows) };
  });
}
