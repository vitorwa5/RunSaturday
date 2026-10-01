import type { FastifyInstance } from 'fastify';
import { DEFAULT_HISTORY_WINDOW, HISTORY_WINDOWS, type EventAnalyticsResponse, type HistoryWindowId } from '@runsaturday/shared';
import { z } from 'zod';
import type { RequestContext } from '../http/context';
import { notFound, parseInput } from '../http/errors';
import { WindowParam } from '../http/schemas';

const Query = z.object({ window: WindowParam.default(DEFAULT_HISTORY_WINDOW) });

export async function analyticsRoutes(app: FastifyInstance, ctx: RequestContext) {
  /** Stored Competition V1 / Difficulty V1 breakdowns ("How it's calculated"). */
  app.get('/api/events/:id/analytics', async (request): Promise<EventAnalyticsResponse> => {
    const { id } = parseInput(z.object({ id: z.string().min(1).max(200) }), request.params);
    const { window } = parseInput(Query, request.query);
    const eventId = await ctx.store.findEventId(id);
    if (!eventId) throw notFound('This event');
    const windowDays = HISTORY_WINDOWS.find((w) => w.id === window)!.days ?? 0;
    const { competition, difficulty } = await ctx.store.getAnalytics(eventId, windowDays);
    return {
      eventId,
      window: window as HistoryWindowId,
      competition,
      difficulty,
      notes: [
        'Competition Score is relative to the events analysed by 5K Compass for the same period. It is not an official or universal parkrun rating, and it does not measure how fast a course is.',
        'Course Difficulty V1 uses known course characteristics only (elevation, surface, course structure), not finishing times.',
        'Confidence describes the data behind a score, not the chance of any result.',
      ],
    };
  });
}
