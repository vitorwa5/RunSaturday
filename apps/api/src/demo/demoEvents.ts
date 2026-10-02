/**
 * ============================================================================
 *  DEMO DATA — FICTIONAL. NOT REAL PARKRUN (OR ANY OTHER) EVENT STATISTICS.
 * ============================================================================
 * Development-only events placed around North West England so the UI can be
 * built before real data ingestion exists. Names are generic, towns are only
 * used to give realistic geography, and every number is invented.
 *
 * PB and Gem base scores here are hand-written placeholders (calculationVersion "demo_v0").
 * Competition and Difficulty are calculated from this data by the analytics engine.
 */
import type { $Enums } from '../generated/prisma/client';

export const DEMO_SCORE_VERSION = 'demo_v0';

export interface DemoEventDefinition {
  slug: string;
  name: string;
  town: string;
  latitude: number;
  longitude: number;
  startLocationText: string;
  courseType: $Enums.CourseType;
  surface: $Enums.Surface;
  laps: number | null;
  elevationM: number | null;
  facilities: {
    parking: $Enums.FacilityStatus;
    toilets: $Enums.FacilityStatus;
    cafe: $Enums.FacilityStatus;
    dogs: $Enums.FacilityStatus;
    buggies: $Enums.FacilityStatus;
    accessibility: $Enums.FacilityStatus;
  };
  /** Parameters for the synthetic history generator. */
  history: {
    /** Number of weekly occurrences to generate (fewer = newer event, less confidence). */
    weeks: number;
    meanParticipants: number;
    /** Median finish time of the field, in seconds. */
    medianSeconds: number;
    /** Spread of the field (log-normal sigma). Larger = deeper fast end. */
    spread: number;
    /** ISO dates (relative week offsets) to mark as cancelled, counted back from the latest. */
    cancelledWeeksAgo?: number[];
  };
  /**
   * Hand-written placeholder Gem base score (hidden_gem_v1 input) for UI development. PB Score,
   * Competition and Difficulty are calculated (pb_v1, competition_v1, difficulty_v1).
   */
  scores: {
    gemBaseScore: number;
  };
}

const UNKNOWN_FACILITIES: DemoEventDefinition['facilities'] = {
  parking: 'UNKNOWN',
  toilets: 'UNKNOWN',
  cafe: 'UNKNOWN',
  dogs: 'UNKNOWN',
  buggies: 'UNKNOWN',
  accessibility: 'UNKNOWN',
};

export const DEMO_EVENTS: DemoEventDefinition[] = [
  {
    slug: 'demo-riverside-5k',
    name: 'Riverside 5K',
    town: 'Warrington',
    latitude: 53.3843,
    longitude: -2.5821,
    startLocationText: 'Riverside path, by the footbridge',
    courseType: 'TWO_LAPS',
    surface: 'TARMAC',
    laps: 2,
    elevationM: 14,
    facilities: { parking: 'YES', toilets: 'YES', cafe: 'YES', dogs: 'YES', buggies: 'YES', accessibility: 'YES' },
    history: { weeks: 26, meanParticipants: 290, medianSeconds: 1680, spread: 0.2 },
    scores: { gemBaseScore: 38 },
  },
  {
    slug: 'demo-victoria-park-5k',
    name: 'Victoria Park 5K',
    town: 'St Helens',
    latitude: 53.4512,
    longitude: -2.7395,
    startLocationText: 'Main lawn near the bandstand',
    courseType: 'THREE_PLUS_LAPS',
    surface: 'MIXED',
    laps: 3,
    elevationM: 54,
    facilities: { parking: 'YES', toilets: 'YES', cafe: 'NO', dogs: 'YES', buggies: 'YES', accessibility: 'UNKNOWN' },
    history: { weeks: 26, meanParticipants: 190, medianSeconds: 1740, spread: 0.19 },
    scores: { gemBaseScore: 52 },
  },
  {
    slug: 'demo-forest-trail-5k',
    name: 'Forest Trail 5K',
    town: 'Delamere',
    latitude: 53.2287,
    longitude: -2.6704,
    startLocationText: 'Forest visitor car park',
    courseType: 'ONE_LAP',
    surface: 'TRAIL',
    laps: 1,
    elevationM: 126,
    facilities: { parking: 'YES', toilets: 'YES', cafe: 'YES', dogs: 'YES', buggies: 'NO', accessibility: 'NO' },
    history: { weeks: 26, meanParticipants: 340, medianSeconds: 1890, spread: 0.18 },
    scores: { gemBaseScore: 30 },
  },
  {
    slug: 'demo-canal-towpath-5k',
    name: 'Canal Towpath 5K',
    town: 'Wigan',
    latitude: 53.5402,
    longitude: -2.6461,
    startLocationText: 'Towpath by lock 12',
    courseType: 'OUT_AND_BACK',
    surface: 'TARMAC',
    laps: 1,
    elevationM: 8,
    facilities: { ...UNKNOWN_FACILITIES, parking: 'YES', toilets: 'NO' },
    history: { weeks: 26, meanParticipants: 120, medianSeconds: 1710, spread: 0.17 },
    scores: { gemBaseScore: 81 },
  },
  {
    slug: 'demo-estuary-path-5k',
    name: 'Estuary Path 5K',
    town: 'Runcorn',
    latitude: 53.3389,
    longitude: -2.7299,
    startLocationText: 'Promenade shelter',
    courseType: 'OUT_AND_BACK',
    surface: 'TARMAC',
    laps: 1,
    elevationM: 11,
    facilities: { parking: 'YES', toilets: 'YES', cafe: 'UNKNOWN', dogs: 'YES', buggies: 'YES', accessibility: 'YES' },
    history: { weeks: 26, meanParticipants: 103, medianSeconds: 1800, spread: 0.16, cancelledWeeksAgo: [3] },
    scores: { gemBaseScore: 89 },
  },
  {
    slug: 'demo-moorland-edge-5k',
    name: 'Moorland Edge 5K',
    town: 'Bolton',
    latitude: 53.6131,
    longitude: -2.4877,
    startLocationText: 'Reservoir dam wall',
    courseType: 'ONE_LAP',
    surface: 'TRAIL',
    laps: 1,
    elevationM: 98,
    facilities: { ...UNKNOWN_FACILITIES, parking: 'YES' },
    history: { weeks: 26, meanParticipants: 85, medianSeconds: 1950, spread: 0.17 },
    scores: { gemBaseScore: 77 },
  },
  {
    slug: 'demo-old-mill-fields-5k',
    name: 'Old Mill Fields 5K',
    town: 'Preston',
    latitude: 53.7632,
    longitude: -2.7031,
    startLocationText: 'Playing fields pavilion',
    courseType: 'THREE_PLUS_LAPS',
    surface: 'GRASS',
    laps: 3,
    elevationM: 31,
    facilities: { parking: 'YES', toilets: 'YES', cafe: 'NO', dogs: 'NO', buggies: 'YES', accessibility: 'UNKNOWN' },
    history: { weeks: 26, meanParticipants: 160, medianSeconds: 1770, spread: 0.18 },
    scores: { gemBaseScore: 61 },
  },
  {
    slug: 'demo-lakeside-5k',
    name: 'Lakeside 5K',
    town: 'Chester',
    latitude: 53.1934,
    longitude: -2.8931,
    startLocationText: 'Lakeside boathouse',
    courseType: 'TWO_LAPS',
    surface: 'TARMAC',
    laps: 2,
    elevationM: 19,
    facilities: { parking: 'YES', toilets: 'YES', cafe: 'YES', dogs: 'YES', buggies: 'YES', accessibility: 'YES' },
    history: { weeks: 26, meanParticipants: 420, medianSeconds: 1650, spread: 0.21 },
    scores: { gemBaseScore: 22 },
  },
  {
    slug: 'demo-heath-common-5k',
    name: 'Heath Common 5K',
    town: 'Macclesfield',
    latitude: 53.2587,
    longitude: -2.1253,
    startLocationText: 'Common entrance gate',
    courseType: 'TWO_LAPS',
    surface: 'GRASS',
    laps: 2,
    elevationM: 64,
    facilities: UNKNOWN_FACILITIES,
    history: { weeks: 26, meanParticipants: 140, medianSeconds: 1860, spread: 0.17 },
    scores: { gemBaseScore: 58 },
  },
  {
    slug: 'demo-dockside-promenade-5k',
    name: 'Dockside Promenade 5K',
    town: 'Liverpool',
    latitude: 53.3989,
    longitude: -2.9916,
    startLocationText: 'Promenade, north end',
    courseType: 'OUT_AND_BACK',
    surface: 'TARMAC',
    laps: 1,
    elevationM: 6,
    facilities: { ...UNKNOWN_FACILITIES, toilets: 'YES' },
    // A newly started event: too few occurrences for confident scores.
    history: { weeks: 4, meanParticipants: 230, medianSeconds: 1700, spread: 0.2 },
    scores: { gemBaseScore: 49 },
  },
];

/** Fictional user available only in explicit demo mode. */
export const DEMO_USER = {
  id: 'demo-user',
  displayName: 'Demo Runner',
  homeLat: 53.3900,
  homeLon: -2.5970,
  homeLabel: 'Warrington (demo home)',
  defaultTravelMinutes: 45,
  preferredGoal: 'PB' as const,
  favouriteEventIds: ['demo-riverside-5k', 'demo-lakeside-5k'],
};

/**
 * The demo user's history before Phase 4A, kept as single values on User/UserEvent. Phase 4A
 * migrates it into dated UserPerformance rows (see demoUserPerformances.ts): each event keeps
 * its visit count and PB, and the lifetime PB and recent best keep their time and event.
 */
export const DEMO_USER_LEGACY_HISTORY = {
  lifetimePb: { eventId: 'demo-riverside-5k', seconds: 1138 }, // 18:58
  recentBest: { eventId: 'demo-riverside-5k', seconds: 1172 }, // 19:32
  events: [
    { eventId: 'demo-riverside-5k', visitCount: 34, personalBestSeconds: 1138 },
    { eventId: 'demo-victoria-park-5k', visitCount: 6, personalBestSeconds: 1176 },
    { eventId: 'demo-lakeside-5k', visitCount: 2, personalBestSeconds: 1149 },
    { eventId: 'demo-forest-trail-5k', visitCount: 1, personalBestSeconds: 1342 },
  ],
} as const;
