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
  PerformanceSource,
  PerformanceSummary,
  PerformanceType,
  RunnerForm,
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

/** The user as stored: settings and preferences only. Performance-derived values are not stored here. */
export interface StoredUser {
  id: string;
  displayName: string;
  homeLat: number | null;
  homeLon: number | null;
  homeLabel: string | null;
  defaultTravelMinutes: number;
  preferredGoal: Goal;
  isDemo: boolean;
  favouriteEventIds: string[];
}

/**
 * The user as the API sees it: stored settings plus values DERIVED from their performances
 * (services/userPerformance.ts). Never read these from storage directly.
 */
export interface UserRecord extends StoredUser {
  performance: PerformanceSummary;
  /** Current Form (runner_form_v1), from its snapshot. */
  currentForm: RunnerForm;
  /** currentForm.formSeconds when it is an estimate, else null. */
  current5kEstimateSeconds: number | null;
  lifetimePbSeconds: number | null;
  recentPbSeconds: number | null;
  lifetimePbEvent: { id: string; name: string } | null;
  recentPbEvent: { id: string; name: string } | null;
  /** Per-event visit state: visited/visitCount/PB derived from performances; favourite stored. */
  events: UserEventRecord[];
}

/** One of a user's performances as stored. Personal data: always read and written by userId. */
export interface PerformanceRecord {
  id: string;
  userId: string;
  /** Exactly one of eventId (known internal event) and externalEventName is set. */
  eventId: string | null;
  /** The internal event's name (null for an external course). */
  eventName: string | null;
  externalEventName: string | null;
  performanceType: PerformanceType;
  distanceMeters: number;
  date: string;
  finishTimeSeconds: number;
  source: PerformanceSource;
  externalResultId: string | null;
  verified: boolean;
}

export interface NewPerformance {
  eventId: string | null;
  externalEventName: string | null;
  performanceType: PerformanceType;
  distanceMeters: number;
  date: string;
  finishTimeSeconds: number;
  source: PerformanceSource;
}

export type PerformancePatch = Omit<NewPerformance, 'source'>;

/** Thrown by stores when the user already has a performance with the same duplicate key. */
export class DuplicatePerformanceError extends Error {
  constructor() {
    super('Duplicate performance');
    this.name = 'DuplicatePerformanceError';
  }
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
  /** Stored settings only; use services/userPerformance.loadUser for derived values. */
  getUser(userId: string): Promise<StoredUser | null>;
  /**
   * PERSONAL DATA. Every performance method takes the owning userId and only ever reads or
   * changes that user's rows, so one user can never reach another's performances.
   */
  /** Newest first (date, then id). */
  listUserPerformances(userId: string, filter?: { eventId?: string }): Promise<PerformanceRecord[]>;
  getUserPerformance(userId: string, id: string): Promise<PerformanceRecord | null>;
  /**
   * Throws DuplicatePerformanceError when the user already has one with the same duplicate key
   * (same location, date and distance; see domain/performanceKey.ts).
   */
  createUserPerformance(userId: string, input: NewPerformance): Promise<PerformanceRecord>;
  /** Null when the user has no such performance. Throws DuplicatePerformanceError like create. */
  updateUserPerformance(userId: string, id: string, patch: PerformancePatch): Promise<PerformanceRecord | null>;
  /** False when the user has no such performance. */
  deleteUserPerformance(userId: string, id: string): Promise<boolean>;
  /** Runner Form snapshot for exactly that date, or null. */
  getRunnerFormSnapshot(userId: string, distanceMeters: number, version: string, asOfDate: string): Promise<RunnerForm | null>;
  /** Insert or replace the snapshot for (user, distance, version, asOfDate). */
  saveRunnerFormSnapshot(userId: string, form: RunnerForm): Promise<void>;
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
