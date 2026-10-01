/**
 * API contract between the RunSaturday server and its clients (web/PWA, Android later).
 * These are transport shapes (DTOs), not database models.
 */
import type { Goal } from './goals';

export type Surface = 'tarmac' | 'trail' | 'grass' | 'mixed' | 'unknown';
export type CourseType = 'one_lap' | 'two_laps' | 'three_plus_laps' | 'out_and_back' | 'point_to_point' | 'unknown';
/** Facility availability. "unknown" is the default: we never invent missing information. */
export type FacilityStatus = 'yes' | 'no' | 'unknown';
/** "insufficient" is shown to users as "Limited data". */
export type ConfidenceLevel = 'high' | 'medium' | 'low' | 'insufficient';
export type DataSource = 'demo' | 'imported';
export type OccurrenceStatus = 'scheduled' | 'completed' | 'cancelled';

export interface TravelEstimate {
  distanceKm: number;
  minutes: number;
  /** How the estimate was made, so the UI can label it honestly. */
  method: 'straight_line_estimate';
}

export interface EventScores {
  /** 0–100, higher = better potential for a fast 5K. */
  pbScore: number | null;
  /** 1.0–10.0, higher = harder. */
  difficultyScore: number | null;
  /** 0–100, higher = stronger historical competition. */
  competitionScore: number | null;
  /** 0–100 base (non-personalised) Hidden Gem score. */
  gemBaseScore: number | null;
  pbConfidence: ConfidenceLevel;
  competitionConfidence: ConfidenceLevel;
  /** Number of event occurrences the scores are based on. Never hidden from users. */
  sampleSize: number;
  /** Analysis window in days (30, 60, 90, 365; 0 = all-time). */
  windowDays: number;
  /** Last date of data included in this snapshot (ISO "YYYY-MM-DD"). */
  asOfDate: string;
  calculationVersion: string;
  calculatedAt: string;
}

export interface EventSummary {
  id: string;
  slug: string;
  name: string;
  town: string | null;
  region: string | null;
  country: string;
  latitude: number;
  longitude: number;
  surface: Surface;
  courseType: CourseType;
  laps: number | null;
  elevationM: number | null;
  averageParticipants: number | null;
  scores: EventScores | null;
  source: DataSource;
  /** Present when the request supplied an origin. */
  travel?: TravelEstimate;
  /** Present when a user context exists. */
  visited?: boolean;
  favourite?: boolean;
}

export interface EventFacilities {
  parking: FacilityStatus;
  toilets: FacilityStatus;
  cafe: FacilityStatus;
  dogs: FacilityStatus;
  buggies: FacilityStatus;
  accessibility: FacilityStatus;
}

export interface OccurrenceSummary {
  date: string;
  status: OccurrenceStatus;
  participantCount: number | null;
  winnerTimeSeconds: number | null;
  thirdTimeSeconds: number | null;
  fifthTimeSeconds: number | null;
  tenthTimeSeconds: number | null;
}

export interface EventDetail extends EventSummary {
  startLocationText: string | null;
  startTime: string | null;
  officialUrl: string | null;
  active: boolean;
  facilities: EventFacilities;
  lastUpdated: string;
  /** Most recent occurrences first. */
  recentOccurrences: OccurrenceSummary[];
  /** Completed occurrences in the default 90-day analysis window. */
  occurrencesLast90Days: number;
}

export interface RecommendationReason {
  text: string;
  /** Whether this reason counts for (positive) or against (caution) the pick. */
  tone: 'positive' | 'caution';
}

export interface Recommendation {
  event: EventSummary;
  /** The metric the pick was ranked by, so the UI never shows an unexplained number. */
  rankedBy: { label: string; value: number | null; unit?: string };
  reasons: RecommendationReason[];
}

export interface BestPickResponse {
  goal: Goal;
  date: string;
  /** Short human description of how ranking works at this stage. */
  method: string;
  pick: Recommendation | null;
  alternatives: Recommendation[];
  /** Explanation when no pick is available (e.g. unsupported goal or no events in range). */
  message?: string;
}

export interface UserProfile {
  id: string;
  displayName: string;
  home: { latitude: number; longitude: number; label: string | null } | null;
  defaultTravelMinutes: number;
  lifetimePbSeconds: number | null;
  recentPbSeconds: number | null;
  current5kEstimateSeconds: number | null;
  preferredGoal: Goal;
  runsCompleted: number;
  uniqueEventsVisited: number;
  savedEventIds: string[];
  isDemo: boolean;
}

export interface HealthResponse {
  status: 'ok' | 'degraded';
  dataSource: 'database' | 'demo-memory';
  database: 'ok' | 'unavailable' | 'not_used';
  version: string;
}

/** Error shape returned to clients. Never contains stack traces or raw driver messages. */
export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
  };
}
