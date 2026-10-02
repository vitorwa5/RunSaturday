import type { FastifyInstance } from 'fastify';
import { formatShortDate, parsePerformanceTime, type PerformanceSummary, type UserPerformance, type UserPerformancesResponse, type UserProfile } from '@runsaturday/shared';
import { z } from 'zod';
import { CURRENT_USER_ID, currentUser, type RequestContext } from '../http/context';
import { AppError, notFound, parseInput } from '../http/errors';
import { DuplicatePerformanceError, type NewPerformance, type PerformanceRecord } from '../repositories/DataStore';
import { isEditable, summarizePerformances, toPerformanceDto } from '../services/userPerformance';

/** Typo guard only (e.g. "1026" for "2026"); not a judgement on old results. */
const EARLIEST_PERFORMANCE_DATE = '1950-01-01';

const Id = z.string().min(1).max(200);
const PerformanceBody = z.object({
  eventId: Id,
  date: z.string().max(20),
  time: z.string().max(20),
});
const ListQuery = z.object({
  eventId: Id.optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

const isCalendarDate = (iso: string) => /^\d{4}-\d{2}-\d{2}$/.test(iso) && new Date(`${iso}T00:00:00Z`).toISOString().slice(0, 10) === iso;

export async function profileRoutes(app: FastifyInstance, ctx: RequestContext) {
  // Phase 4A: no authentication yet, so the user is always the demo user. Every store call
  // below passes that userId explicitly; the store never returns another user's rows.
  const userId = CURRENT_USER_ID;

  /** Validates input against business rules; returns the values to store. */
  async function validated(body: z.infer<typeof PerformanceBody>): Promise<NewPerformance> {
    const eventId = await ctx.store.findEventId(body.eventId);
    if (!eventId) throw new AppError(400, 'unknown_event', 'Choose an event from the list.');
    if (!isCalendarDate(body.date)) throw new AppError(400, 'invalid_date', 'Enter a valid date.');
    if (body.date > ctx.today()) throw new AppError(400, 'future_date', 'The date cannot be in the future.');
    if (body.date < EARLIEST_PERFORMANCE_DATE) throw new AppError(400, 'invalid_date', 'Enter a valid date.');
    const finishTimeSeconds = parsePerformanceTime(body.time);
    if (finishTimeSeconds == null) throw new AppError(400, 'invalid_time', 'Enter a finish time like 19:35 or 1:05:30.');
    return { eventId, date: body.date, finishTimeSeconds, source: 'manual' };
  }

  const duplicate = async (input: NewPerformance) => {
    const name = (await ctx.store.getEvent(input.eventId, ctx.today()))?.name ?? 'this event';
    return new AppError(409, 'duplicate_performance', `You already have a performance at ${name} on ${formatShortDate(input.date)}. Edit that one instead.`);
  };

  async function editableOr404(id: string): Promise<PerformanceRecord> {
    const existing = await ctx.store.getUserPerformance(userId, id);
    if (!existing) throw notFound('This performance');
    if (!isEditable(existing)) throw new AppError(403, 'read_only', 'Imported performances cannot be edited here.');
    return existing;
  }

  app.get('/api/profile', async (): Promise<UserProfile> => {
    const user = await currentUser(ctx);
    if (!user) throw notFound('Your profile');
    return {
      id: user.id,
      displayName: user.displayName,
      home:
        user.homeLat != null && user.homeLon != null
          ? { latitude: user.homeLat, longitude: user.homeLon, label: user.homeLabel }
          : null,
      defaultTravelMinutes: user.defaultTravelMinutes,
      lifetimePbSeconds: user.lifetimePbSeconds,
      recentPbSeconds: user.recentPbSeconds,
      lifetimePbEvent: user.lifetimePbEvent,
      recentPbEvent: user.recentPbEvent,
      current5kEstimateSeconds: user.current5kEstimateSeconds,
      preferredGoal: user.preferredGoal,
      runsCompleted: user.performance.totalPerformances,
      uniqueEventsVisited: user.performance.uniqueEvents,
      savedEventIds: user.favouriteEventIds,
      isDemo: user.isDemo,
      performance: user.performance,
    };
  });

  app.get('/api/profile/performance-summary', async (): Promise<PerformanceSummary> => {
    return summarizePerformances(await ctx.store.listUserPerformances(userId), ctx.today());
  });

  app.get('/api/profile/performances', async (request): Promise<UserPerformancesResponse> => {
    const q = parseInput(ListQuery, request.query);
    const eventId = q.eventId != null ? await ctx.store.findEventId(q.eventId) : undefined;
    if (q.eventId != null && !eventId) throw notFound('This event');
    const all = await ctx.store.listUserPerformances(userId, eventId ? { eventId } : {});
    return { performances: all.slice(0, q.limit ?? all.length).map(toPerformanceDto), total: all.length };
  });

  app.get('/api/profile/performances/:id', async (request): Promise<UserPerformance> => {
    const { id } = parseInput(z.object({ id: Id }), request.params);
    const p = await ctx.store.getUserPerformance(userId, id);
    if (!p) throw notFound('This performance');
    return toPerformanceDto(p);
  });

  app.post('/api/profile/performances', async (request, reply): Promise<UserPerformance> => {
    const input = await validated(parseInput(PerformanceBody, request.body));
    try {
      const created = await ctx.store.createUserPerformance(userId, input);
      reply.status(201);
      return toPerformanceDto(created);
    } catch (error) {
      if (error instanceof DuplicatePerformanceError) throw await duplicate(input);
      throw error;
    }
  });

  app.patch('/api/profile/performances/:id', async (request): Promise<UserPerformance> => {
    const { id } = parseInput(z.object({ id: Id }), request.params);
    await editableOr404(id);
    const input = await validated(parseInput(PerformanceBody, request.body));
    try {
      const updated = await ctx.store.updateUserPerformance(userId, id, input);
      if (!updated) throw notFound('This performance');
      return toPerformanceDto(updated);
    } catch (error) {
      if (error instanceof DuplicatePerformanceError) throw await duplicate(input);
      throw error;
    }
  });

  app.delete('/api/profile/performances/:id', async (request, reply) => {
    const { id } = parseInput(z.object({ id: Id }), request.params);
    await editableOr404(id);
    await ctx.store.deleteUserPerformance(userId, id);
    return reply.status(204).send();
  });
}
