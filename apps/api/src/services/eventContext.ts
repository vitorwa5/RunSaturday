/** Adds request-specific context (travel from an origin, the user's visit state) to stored events. */
import type { EventSummary } from '@runsaturday/shared';
import type { EventRecord, UserRecord } from '../repositories/DataStore';
import { estimateTravel, type Coordinates } from './travel';

export function withContext(
  events: EventRecord[],
  origin: Coordinates | null,
  user: UserRecord | null,
): EventSummary[] {
  const userEvents = new Map(user?.events.map((ue) => [ue.eventId, ue]));
  return events.map((e) => {
    const ue = userEvents.get(e.id);
    return {
      ...e,
      ...(origin ? { travel: estimateTravel(origin, e) } : {}),
      ...(user ? { visited: ue?.visited ?? false, favourite: ue?.favourite ?? false } : {}),
    };
  });
}

/** Events within `maxTravelMinutes`, nearest first. Events without a travel estimate are excluded. */
export function nearest(events: EventSummary[], maxTravelMinutes: number | null, limit: number): EventSummary[] {
  return events
    .filter((e) => e.travel && (maxTravelMinutes == null || e.travel.minutes <= maxTravelMinutes))
    .sort((a, b) => a.travel!.minutes - b.travel!.minutes)
    .slice(0, limit);
}
