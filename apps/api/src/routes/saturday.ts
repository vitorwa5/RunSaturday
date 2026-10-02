/**
 * Saturday recommendations (Phase 5B). GET /api/saturday/recommendations is the one entry point
 * for "Where should I run this Saturday?". /api/planner and /api/recommendations/best-pick are
 * thin adapters over the same orchestrator, so Home and the Saturday Planner can never rank
 * differently.
 */
import {
  CONFIDENCE_FILTERS,
  COURSE_FILTERS,
  ELEVATION_FILTERS,
  PARTICIPANT_FILTERS,
  PLANNER_SATURDAYS,
  SURFACE_FILTERS,
  upcomingSaturdays,
  VISITED_FILTERS,
  type BestPickResponse,
  type Goal,
  type SaturdayRecommendationsResponse,
} from '@runsaturday/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { currentUser, resolveOrigin, type RequestContext } from '../http/context';
import { AppError, parseInput } from '../http/errors';
import { GoalParam, idsOf, MaxTravel, OriginQuery, TravelOption } from '../http/schemas';
import { orchestrateSaturday } from '../saturday/orchestrator';

export const FALLBACK_TRAVEL_MINUTES = 45;

const SaturdayQuery = z.object({
  intent: GoalParam.optional(),
  /** Legacy name for `intent` (Phase 1–5A URLs). */
  goal: GoalParam.optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  maxTravel: TravelOption.optional(),
  surface: z.enum(idsOf(SURFACE_FILTERS)).default('any'),
  elevation: z.enum(idsOf(ELEVATION_FILTERS)).default('any'),
  participants: z.enum(idsOf(PARTICIPANT_FILTERS)).default('any'),
  visited: z.enum(idsOf(VISITED_FILTERS)).default('any'),
  course: z.enum(idsOf(COURSE_FILTERS)).default('any'),
  confidence: z.enum(idsOf(CONFIDENCE_FILTERS)).default('any'),
  challenge: z.string().trim().min(1).max(50).optional(),
  item: z.string().trim().min(1).max(50).transform((s) => s.toUpperCase()).optional(),
  offset: z.coerce.number().int().min(0).max(1000).default(0),
});

async function saturdayRecommendations(ctx: RequestContext, query: unknown, travelOverride?: number): Promise<SaturdayRecommendationsResponse> {
  const originQuery = parseInput(OriginQuery, query);
  const { intent: intentParam, goal: goalParam, date: dateParam, maxTravel, challenge, item, offset, ...filters } = parseInput(SaturdayQuery, query);

  const availableDates = upcomingSaturdays(ctx.today(), PLANNER_SATURDAYS);
  const date = dateParam ?? availableDates[0]!;
  if (!availableDates.includes(date)) {
    throw new AppError(400, 'unsupported_date', `Planning is available for the next ${PLANNER_SATURDAYS} Saturdays only.`);
  }

  const user = await currentUser(ctx);
  const intent = (intentParam ?? goalParam ?? user?.preferredGoal ?? 'pb') as Goal;
  const maxTravelMinutes = travelOverride ?? maxTravel ?? user?.defaultTravelMinutes ?? FALLBACK_TRAVEL_MINUTES;
  const originCoords = resolveOrigin(originQuery, user);
  const origin = !originCoords ? null : originQuery.lat != null ? { label: 'Chosen location', source: 'coordinates' as const } : { label: user?.homeLabel ?? 'Home', source: 'home' as const };

  const r = await orchestrateSaturday(ctx.store, user, {
    intent,
    date,
    today: ctx.today(),
    maxTravelMinutes,
    filters,
    origin: originCoords,
    challenge: { id: challenge, item },
    offset,
  });

  return {
    ...r,
    goal: intent,
    date,
    availableDates,
    origin,
    maxTravelMinutes,
    filters,
    notes: [
      'Rankings use historical data only. They do not yet change with the date, weather or cancellations.',
      'Travel times are estimates from straight-line distance, not driving directions.',
    ],
  };
}

const BestPickQuery = z.object({ maxTravel: MaxTravel }).passthrough();

export async function saturdayRoutes(app: FastifyInstance, ctx: RequestContext) {
  app.get('/api/saturday/recommendations', async (request) => saturdayRecommendations(ctx, request.query));

  /** Saturday Planner (kept for existing clients): the same orchestrated response. */
  app.get('/api/planner', async (request) => saturdayRecommendations(ctx, request.query));

  /** Home's original best pick (kept for existing clients): the same orchestrator, compact shape. */
  app.get('/api/recommendations/best-pick', async (request): Promise<BestPickResponse> => {
    const { maxTravel } = parseInput(BestPickQuery, request.query);
    const { maxTravel: _ignored, ...rest } = request.query as Record<string, unknown>;
    const r = await saturdayRecommendations(ctx, { goal: 'pb', ...rest }, maxTravel);
    return {
      goal: r.intent,
      date: r.date,
      method: r.method,
      pick: r.bestPick,
      alternatives: r.alternatives,
      ...(r.message && !r.bestPick ? { message: r.message } : {}),
    };
  });
}
