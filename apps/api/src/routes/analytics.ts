import type { FastifyInstance } from 'fastify';
import { DEFAULT_HISTORY_WINDOW, HISTORY_WINDOWS, type EventAnalyticsResponse, type HistoryWindowId } from '@runsaturday/shared';
import { z } from 'zod';
import type { RequestContext } from '../http/context';
import { notFound, parseInput } from '../http/errors';
import { WindowParam } from '../http/schemas';

const Query = z.object({ window: WindowParam.default(DEFAULT_HISTORY_WINDOW) });

export async function analyticsRoutes(app: FastifyInstance, ctx: RequestContext) {
  /** Stored Competition V1 / Difficulty V1 / Course Speed V1 / PB Score V1 breakdowns ("How it's calculated"). */
  app.get('/api/events/:id/analytics', async (request): Promise<EventAnalyticsResponse> => {
    const { id } = parseInput(z.object({ id: z.string().min(1).max(200) }), request.params);
    const { window } = parseInput(Query, request.query);
    const eventId = await ctx.store.findEventId(id);
    if (!eventId) throw notFound('This event');
    const windowDays = HISTORY_WINDOWS.find((w) => w.id === window)!.days ?? 0;
    // Course Speed and PB Score use their own fixed 365-day window, whatever the selected period.
    const { competition, difficulty, courseSpeed, pb } = await ctx.store.getAnalytics(eventId, windowDays);
    return {
      eventId,
      window: window as HistoryWindowId,
      competition,
      difficulty,
      courseSpeed,
      pb,
      notes: [
        'Competition Score is relative to the events analysed by 5K Compass for the same period. It is not an official or universal parkrun rating, and it does not measure how fast a course is.',
        'Course Difficulty V1 uses known course characteristics only (elevation, surface, course structure), not finishing times.',
        'Course Speed Factor compares the same runners at different events within 90 days of each other, over the last year. Factors are centred so the geometric mean of the eligible analysed cohort is 1.000: a cohort reference, not a neutral 5K course. Above 1 means runners have typically been slower here relative to that cohort. It describes past results, not future ones.',
        'PB Score V1 is 75% observed course speed and 25% structural ease (inverse Course Difficulty). Competition is never part of it.',
        'Confidence describes the data behind a score, not the chance of any result.',
      ],
    };
  });
}
