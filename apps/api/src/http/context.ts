import { calendarDateIn, nextSaturday } from '@runsaturday/shared';
import type { AppConfig } from '../config/env';
import type { DataStore, UserRecord } from '../repositories/DataStore';
import type { Coordinates } from '../services/travel';

/**
 * PHASE 1 STAND-IN: there is no authentication yet, so every request acts as the demo
 * user. Replace this single function when accounts arrive.
 */
export const CURRENT_USER_ID = 'demo-user';

export interface RequestContext {
  store: DataStore;
  config: AppConfig;
  /** Today's calendar date in APP_TIME_ZONE. */
  today: () => string;
}

export function upcomingSaturday(ctx: RequestContext): string {
  return nextSaturday(ctx.today());
}

export function createTodayFn(config: AppConfig, now: () => Date) {
  return () => calendarDateIn(now(), config.APP_TIME_ZONE);
}

export async function currentUser(ctx: RequestContext): Promise<UserRecord | null> {
  return ctx.store.getUser(CURRENT_USER_ID);
}

/** Explicit lat/lon wins; otherwise fall back to the user's saved home location. */
export function resolveOrigin(
  query: { lat?: number | undefined; lon?: number | undefined },
  user: UserRecord | null,
): Coordinates | null {
  if (query.lat != null && query.lon != null) return { latitude: query.lat, longitude: query.lon };
  if (user?.homeLat != null && user.homeLon != null) return { latitude: user.homeLat, longitude: user.homeLon };
  return null;
}
