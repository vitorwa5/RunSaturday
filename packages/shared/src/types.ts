/**
 * API contract between the RunSaturday server and its clients (web/PWA, Android later).
 * These are transport shapes (DTOs), not database models.
 */
import type { Goal } from './goals';
import type { HistoryWindowId, PlannerFilters } from './planner';
import type { HiddenGemModeId, PbFinderSortId, PlacementTargetId } from './tools';

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
  /** Course Difficulty V1 (difficulty_v1): 1.0–10.0 structural rating, higher = harder. */
  difficultyScore: number | null;
  /** Competition V1 (competition_v1): 0–100, relative to the analysed events, higher = deeper. */
  competitionScore: number | null;
  /** 0–100 base (non-personalised) Hidden Gem score. */
  gemBaseScore: number | null;
  /** Confidence of the (demo) PB Score data. */
  pbConfidence: ConfidenceLevel;
  /** Confidence V2 level for Competition V1. */
  competitionConfidence: ConfidenceLevel;
  /** Confidence V2 internal score (0–100) for Competition V1. */
  competitionConfidenceScore: number | null;
  /** Usable occurrences behind Competition V1 (90-day window). */
  competitionSampleSize: number;
  difficultyConfidence: ConfidenceLevel;
  /** Versions behind each value; PB stays demo until Phase 3B. */
  versions: { pb: string; competition: string | null; difficulty: string | null };
  /** Number of event occurrences the (demo) PB Score is based on. Never hidden from users. */
  sampleSize: number;
  /** Analysis window in days (30, 60, 90, 365; 0 = all-time). */
  windowDays: number;
  /** Last date of data included in this snapshot (ISO "YYYY-MM-DD"). */
  asOfDate: string;
  /** Version of the PB snapshot (e.g. demo_v0); see `versions` for the others. */
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
  /** 1-based position in the ranking. */
  rank: number;
  event: EventSummary;
  /** The metric the pick was ranked by, so the UI never shows an unexplained number. */
  rankedBy: {
    /** Stable identifier of the metric, for display logic. */
    key: 'pb_score' | 'competition_score' | 'gem_score' | 'travel_minutes' | 'average_participants';
    label: string;
    value: number | null;
    unit?: string;
    /** Scale maximum, e.g. 100 for "92 / 100". */
    outOf?: number;
    direction: 'higher_is_better' | 'lower_is_better';
  };
  /** Up to three short tags summarising the pick, e.g. ["Fast", "Flat", "Close by"]. */
  highlights: string[];
  /** Full "Why this?" explanation. */
  reasons: RecommendationReason[];
}

export interface BestPickResponse {
  goal: Goal;
  date: string;
  /** How ranking works at this stage, e.g. "ranked using PB Score". */
  method: string;
  pick: Recommendation | null;
  alternatives: Recommendation[];
  /** Explanation when no pick is available (e.g. unsupported goal or no events in range). */
  message?: string;
}

export interface PlannerResponse {
  date: string;
  /** Saturdays that can be planned, upcoming first. */
  availableDates: string[];
  goal: Goal;
  origin: { label: string; source: 'home' | 'coordinates' } | null;
  maxTravelMinutes: number;
  filters: PlannerFilters;
  method: string;
  results: Recommendation[];
  counts: {
    /** Active events considered. */
    total: number;
    withinTravel: number;
    /** Within travel AND matching filters (before goal eligibility). */
    matchingFilters: number;
  };
  /** Why there are no results, when there are none. */
  message?: string;
  /** Honest caveats about what the ranking does and does not consider. */
  notes: string[];
}

export interface HistorySummary {
  /** Completed events in the window. */
  eventsHeld: number;
  cancelled: number;
  medianParticipants: number | null;
  medianWinnerSeconds: number | null;
  medianThirdSeconds: number | null;
  medianFifthSeconds: number | null;
  medianTenthSeconds: number | null;
}

export interface EventHistoryResponse {
  eventId: string;
  window: HistoryWindowId;
  /** First date included, or null for all history. */
  from: string | null;
  to: string;
  summary: HistorySummary;
  /** Occurrences in the window, most recent first. */
  occurrences: OccurrenceSummary[];
  /** Everything stored for this event, so the UI can explain when a window exceeds it. */
  coverage: { firstDate: string | null; lastDate: string | null; totalOccurrences: number };
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

// ---------------------------------------------------------------------------
// Historical placement (Where Could I Place?, Compare, Event outlook)
// ---------------------------------------------------------------------------

/** A historical frequency: "Top 10 in `count` of `of` events". Never a probability. */
export interface HistoricalFrequency {
  count: number;
  of: number;
}

export interface HistoricalPlacement {
  date: string;
  /**
   * Where the target time would have placed. Results on exactly the same second make the
   * exact placing unknowable, so it is a range:
   *   best  = faster finishers + 1
   *   worst = faster finishers + finishers on the same time + 1
   * best === worst when nobody recorded the same time.
   */
  best: number;
  worst: number;
  /** Finishers that day (excluding the hypothetical runner). */
  fieldSize: number;
}

/** A placement range; low === high when it is exact. */
export interface PlacementRange {
  low: number;
  high: number;
}

export interface PlacementStats {
  /** Median of best-case placings to median of worst-case placings (each rounded half up). */
  medianPlacement: PlacementRange;
  /** Best best-case placing across events. */
  bestPlacement: number;
  /** Worst worst-case placing across events. */
  worstPlacement: number;
  /** 25th percentile of best-case to 75th percentile of worst-case placings (nearest rank). */
  typicalRange: PlacementRange;
  /**
   * Conservative: an event only counts towards a target when even the worst-case tie order
   * reaches it.
   */
  frequencies: {
    first: HistoricalFrequency;
    top3: HistoricalFrequency;
    top5: HistoricalFrequency;
    top10: HistoricalFrequency;
    top10Percent: HistoricalFrequency;
    top25Percent: HistoricalFrequency;
  };
}

export interface EventPlacement {
  event: EventSummary;
  /** Usable occurrences in the window. */
  sampleSize: number;
  confidence: ConfidenceLevel;
  /** Null when there is no usable result data in the window. */
  stats: PlacementStats | null;
  /** Frequency for the requested target. */
  target: HistoricalFrequency | null;
  /** Occurrences left out: cancelled, or results missing/incomplete/unvalidated. */
  excluded: { cancelled: number; insufficientData: number };
  /** Most recent first. */
  history: HistoricalPlacement[];
}

export interface PlacementResponse {
  timeSeconds: number;
  window: HistoryWindowId;
  from: string | null;
  to: string;
  target: PlacementTargetId;
  maxTravelMinutes: number | null;
  /** Ranked by how often the target was reached historically. */
  results: EventPlacement[];
  /** Events in range with no usable results in the window. */
  eventsWithoutData: number;
  notes: string[];
}

// ---------------------------------------------------------------------------
// PB Finder
// ---------------------------------------------------------------------------

export interface PbFinderResponse {
  sort: PbFinderSortId;
  maxTravelMinutes: number;
  filters: Pick<PlannerFilters, 'surface' | 'elevation' | 'confidence' | 'visited'>;
  results: Recommendation[];
  counts: { total: number; withinTravel: number; matching: number };
  message?: string;
  notes: string[];
}

// ---------------------------------------------------------------------------
// Hidden Gems
// ---------------------------------------------------------------------------

export interface HiddenGemComponent {
  key: 'placement_opportunity' | 'low_participants' | 'travel_convenience' | 'reliability' | 'not_visited';
  label: string;
  /** Weight as a fraction, e.g. 0.35. */
  weight: number;
  /** Normalised 0–100. */
  value: number;
  /** value × weight, rounded to 0.1. */
  contribution: number;
  /** How the value was derived, in plain words. */
  basis: string;
}

export interface HiddenGem {
  rank: number;
  event: EventSummary;
  /** 0–100, rounded. */
  gemScore: number;
  components: HiddenGemComponent[];
  /** "Why it's a gem" lines. */
  reasons: RecommendationReason[];
}

export interface HiddenGemsResponse {
  algorithm: string;
  mode: HiddenGemModeId;
  maxTravelMinutes: number;
  /** Runner time used for placement opportunity, when available. */
  timeSeconds: number | null;
  results: HiddenGem[];
  message?: string;
  notes: string[];
}

// ---------------------------------------------------------------------------
// Compare
// ---------------------------------------------------------------------------

export type CompareMetricKey =
  | 'pb_score'
  | 'difficulty'
  | 'competition'
  | 'average_participants'
  | 'elevation'
  | 'travel'
  | 'median_placement'
  | 'top10';

export interface CompareResponse {
  /** In the requested order. */
  events: { event: EventSummary; placement: EventPlacement | null }[];
  /** Requested ids that do not exist. */
  missing: string[];
  timeSeconds: number | null;
  window: HistoryWindowId;
  /** Event ids with the most favourable value per metric (ties included); absent when not comparable. */
  best: Partial<Record<CompareMetricKey, string[]>>;
}

// ---------------------------------------------------------------------------
// Core analytics (Phase 3A): Competition V1, Difficulty V1, Confidence V2
// ---------------------------------------------------------------------------

export interface ConfidenceFactor {
  key: 'amount' | 'recency' | 'completeness' | 'stability' | 'structure';
  label: string;
  /** Weight as a fraction (factors with weight sum to 1). */
  weight: number;
  /** 0–100. */
  value: number;
  /** Plain-language basis, e.g. "12 usable events". */
  detail: string;
}

/** Confidence in the DATA behind a metric. Never a probability of a future result. */
export interface ConfidenceAssessment {
  level: ConfidenceLevel;
  /** Internal 0–100 score. */
  score: number;
  factors: ConfidenceFactor[];
}

export interface CompetitionComponent {
  key: 'winner' | 'third' | 'fifth' | 'tenth' | 'field_depth';
  label: string;
  weight: number;
  /** 0–100 relative strength within the analysed cohort; null when missing. */
  value: number | null;
  /** Median finish time behind the value. */
  medianSeconds: number | null;
  /** Occurrences contributing to the median. */
  observations: number;
}

export interface CompetitionBreakdown {
  metric: 'competition';
  version: string;
  /** 0–100, or null with "Limited data". */
  value: number | null;
  windowDays: number;
  asOfDate: string;
  /** Usable occurrences for this event. */
  sampleSize: number;
  /** Events in the comparison cohort for this window. */
  cohortSize: number;
  components: CompetitionComponent[];
  confidence: ConfidenceAssessment;
  excluded: { cancelled: number; insufficientData: number };
}

export interface DifficultyComponent {
  key: 'elevation' | 'surface' | 'structure';
  label: string;
  weight: number;
  /** 0–100 severity; null when the input is unknown. */
  value: number | null;
  /** The stored fact behind it, e.g. "14 m", "Tarmac", "2 laps". */
  input: string;
  missing: boolean;
}

export interface DifficultyBreakdown {
  metric: 'difficulty';
  version: string;
  /** 1.0–10.0, or null when too little is known. */
  value: number | null;
  asOfDate: string;
  components: DifficultyComponent[];
  confidence: ConfidenceAssessment;
}

export interface EventAnalyticsResponse {
  eventId: string;
  window: HistoryWindowId;
  competition: CompetitionBreakdown | null;
  difficulty: DifficultyBreakdown | null;
  notes: string[];
}
