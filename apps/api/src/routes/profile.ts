import type { FastifyInstance } from 'fastify';
import type { UserProfile } from '@runsaturday/shared';
import { currentUser, type RequestContext } from '../http/context';
import { notFound } from '../http/errors';

export async function profileRoutes(app: FastifyInstance, ctx: RequestContext) {
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
      current5kEstimateSeconds: user.current5kEstimateSeconds,
      preferredGoal: user.preferredGoal,
      runsCompleted: user.events.reduce((n, ue) => n + ue.visitCount, 0),
      uniqueEventsVisited: user.events.filter((ue) => ue.visited).length,
      savedEventIds: user.events.filter((ue) => ue.favourite).map((ue) => ue.eventId),
      isDemo: user.isDemo,
    };
  });
}
