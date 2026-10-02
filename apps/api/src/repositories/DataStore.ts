/**
 * The boundary between the API and its data. Routes and services depend on this
 * interface only, never on Prisma directly, so storage can change (and tests can
 * run without PostgreSQL).
 */
import type {
  CompetitionBreakdown,
  CourseSpeedBreakdown,
  DifficultyBreakdown,
  EventDetail,
  EventSummary,
  Goal,
  OccurrenceSummary,
  PbBreakdown,
} from '@runsaturday/shared';
import type { CourseFactorResult, PerformanceInput } from '../analytics/courseSpeed';
import type { CompetitionOccurrenceInput } from '../analytics/competition';
import type { PlacementOccurrenceInput } from '../domain/placementEngine';

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
  lifetimePbEvent: { id: string; name: string } | null;
  recentPbEvent: { id: string; name: string } | null;
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
  /** Resolve an id or slug to the event id, or null when it does not exist. */
  findEventId(idOrSlug: string): Promise<string | null>;
  /**
   * All occurrences of an event (summary cache only, no Result rows), any order.
   * Fine at current volumes (~52 per event per year); move windowing into SQL if needed.
   */
  listOccurrences(eventId: string): Promise<OccurrenceSummary[]>;
  /**
   * Per-occurrence result counts for a target time: how many results were strictly faster,
   * and how many recorded exactly the same time.
   * Covers occurrences dated within [from, to] (from = null for all history), optionally only
   * for the given events. Individual results never leave the data layer.
   */
  listPlacementInputs(timeSeconds: number, eventIds: string[] | null, from: string | null, to: string): Promise<PlacementOccurrenceInput[]>;
  getUser(userId: string): Promise<UserRecord | null>;
  /**
   * Latest stored analytics for an event: Competition V1 for the window (days; 0 = all history)
   * and Difficulty V1. Read from snapshots; never recalculated per request.
   */
  getAnalytics(
    eventId: string,
    windowDays: number,
  ): Promise<{ competition: CompetitionBreakdown | null; difficulty: DifficultyBreakdown | null; courseSpeed: CourseSpeedBreakdown | null; pb: PbBreakdown | null }>;
  /**
   * Latest Course Speed Factors from ONE calculation run (bootstrap draws are only comparable
   * within a run), for course-adjusted comparisons.
   */
  listCourseFactors(): Promise<CourseFactorResult[]>;
  /** Results with a pseudonymous athlete key from usable occurrences dated in [from, to]. */
  listPerformances(from: string | null, to: string): Promise<PerformanceInput[]>;
  /** Per-occurrence placing times derived from Result rows, for occurrences dated on or before `to`. */
  listCompetitionInputs(to: string): Promise<CompetitionOccurrenceInput[]>;
  /** True when the underlying store is reachable. */
  ping(): Promise<boolean>;
  close(): Promise<void>;
}
