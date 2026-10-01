/**
 * The boundary between the API and its data. Routes and services depend on this
 * interface only, never on Prisma directly, so storage can change (and tests can
 * run without PostgreSQL).
 */
import type { EventDetail, EventSummary, Goal } from '@runsaturday/shared';

/** Event as stored, before request-specific context (travel, visited) is added. */
export type EventRecord = Omit<EventSummary, 'travel' | 'visited' | 'favourite'>;
export type EventDetailRecord = Omit<EventDetail, 'travel' | 'visited' | 'favourite'>;

export interface UserEventRecord {
  eventId: string;
  visited: boolean;
  favourite: boolean;
  visitCount: number;
  personalBestSeconds: number | null;
}

export interface UserRecord {
  id: string;
  displayName: string;
  homeLat: number | null;
  homeLon: number | null;
  homeLabel: string | null;
  defaultTravelMinutes: number;
  lifetimePbSeconds: number | null;
  recentPbSeconds: number | null;
  current5kEstimateSeconds: number | null;
  preferredGoal: Goal;
  isDemo: boolean;
  events: UserEventRecord[];
}

export interface DataStore {
  readonly kind: 'database' | 'demo-memory';
  /** Active events with their scores for the active calculation version. */
  listActiveEvents(): Promise<EventRecord[]>;
  /** Case-insensitive match on name, town or region. */
  searchEvents(query: string, limit: number): Promise<EventRecord[]>;
  /** Look up by id or slug. `today` (ISO date) anchors the 90-day sample count. */
  getEvent(idOrSlug: string, today: string): Promise<EventDetailRecord | null>;
  getUser(userId: string): Promise<UserRecord | null>;
  /** True when the underlying store is reachable. */
  ping(): Promise<boolean>;
  close(): Promise<void>;
}
