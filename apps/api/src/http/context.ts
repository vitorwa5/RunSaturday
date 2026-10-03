import { calendarDateIn, nextSaturday } from '@runsaturday/shared';
import type { AppConfig } from '../config/env';
import type { DataStore, UserRecord } from '../repositories/DataStore';
import type { Coordinates } from '../services/travel';
import { loadUser } from '../services/userPerformance';

import { AsyncLocalStorage } from 'node:async_hooks';
import { AppError } from './errors';

/** Handler-local identity, populated only by the validated HTTP session boundary. */
export interface RequestIdentity {
  userId: string | null;
  session?: { user: { id: string; email: string | null }; expiresAt: string };
}
export const identities = new AsyncLocalStorage<RequestIdentity>();
export function currentUserId(ctx: RequestContext): string {
  const id = identities.getStore()?.userId;
  if (!id || (ctx.config.APP_MODE === 'beta' && id === 'demo-user')) throw new AppError(401, 'authentication_required', 'Sign in to access your account.');
  return id;
}

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

/** The current user with performance-derived values (lifetime PB, recent best, visits). */
export async function currentUser(ctx: RequestContext): Promise<UserRecord | null> {
  const id = identities.getStore()?.userId;
  return id ? loadUser(ctx.store, id, ctx.today()) : null;
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
