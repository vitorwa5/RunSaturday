/**
 * In-memory DataStore backed by the DEMO dataset (fictional). Lets the UI run without
 * PostgreSQL (DATA_SOURCE=demo) and gives API tests a deterministic fixture.
 */
import { addDays, type OccurrenceSummary } from '@runsaturday/shared';
import { computeCoreAnalytics, usablePerformances, type CoreAnalytics } from '../../analytics/core';
import type { CourseFactorResult, PerformanceInput } from '../../analytics/courseSpeed';
import { toCourseSpeedBreakdown, toPbBreakdown } from '../../analytics/dto';
import { DEFAULT_ANALYTICS_WINDOW } from '../../analytics/versions';
import {
  buildDemoDataset,
  DEMO_WINDOW_DAYS,
  demoCompetitionInputs,
  demoCourseFacts,
  demoPerformances,
  type DemoDataset,
  type DemoEventBundle,
} from '../../demo/buildDemoDataset';
import { assembleScores } from '../scoreAssembly';
import type { PlacementOccurrenceInput } from '../../domain/placementEngine';
import type { DataStore, EventDetailRecord, EventRecord, UserRecord } from '../DataStore';

const lower = <T extends string>(v: string) => v.toLowerCase() as T;
const RECENT_OCCURRENCES = 12;

function toRecord(b: DemoEventBundle, dataset: DemoDataset, analytics: CoreAnalytics, generatedAt: string): EventRecord {
  const { def } = b;
  return {
    id: b.id,
    slug: def.slug,
    name: def.name,
    town: def.town,
    region: 'North West England',
    country: 'England',
    latitude: def.latitude,
    longitude: def.longitude,
    surface: lower(def.surface),
    courseType: lower(def.courseType),
    laps: def.laps,
    elevationM: def.elevationM,
    averageParticipants: b.averageParticipants != null ? Math.round(b.averageParticipants) : null,
    source: 'demo',
    scores: assembleScores(
      {
        gemBaseScore: def.scores.gemBaseScore,
        sampleSize: b.sampleSize,
        windowDays: DEMO_WINDOW_DAYS,
        asOfDate: dataset.latestDate,
        calculatedAt: generatedAt,
      },
      pbOf(analytics, b.id),
      analytics.competition.get(b.id)?.get(DEFAULT_ANALYTICS_WINDOW) ?? null,
      analytics.difficulty.get(b.id) ?? null,
      speedOf(analytics, b.id),
    ),
  };
}

function pbOf(analytics: CoreAnalytics, eventId: string) {
  const p = analytics.pb.get(eventId);
  return p ? toPbBreakdown(p) : null;
}

function speedOf(analytics: CoreAnalytics, eventId: string) {
  const f = analytics.courseFactors.get(eventId);
  return f ? toCourseSpeedBreakdown(f) : null;
}

/**
 * The demo dataset and its analytics depend only on "today", and the Course Speed bootstrap
 * takes a few seconds, so both are computed once per date and shared between store instances.
 */
const cache = new Map<string, { dataset: DemoDataset; analytics: CoreAnalytics; performances: PerformanceInput[] }>();

function demoState(today: string) {
  let state = cache.get(today);
  if (!state) {
    const dataset = buildDemoDataset(today);
    const inputs = demoCompetitionInputs(dataset);
    const performances = usablePerformances(demoPerformances(dataset), inputs);
    // Same pure calculation the recalculation job persists.
    const analytics = computeCoreAnalytics(demoCourseFacts(dataset), inputs, performances, today);
    state = { dataset, analytics, performances };
    cache.set(today, state);
  }
  return state;
}

/** Occurrence summaries, oldest first (generation order). */
function toOccurrenceSummaries(b: DemoEventBundle): OccurrenceSummary[] {
  return b.occurrences.map(({ results: _results, status, ...o }) => ({ ...o, status: lower(status) }));
}

export class MemoryDataStore implements DataStore {
  readonly kind = 'demo-memory' as const;
  private readonly dataset: DemoDataset;
  private readonly analytics: CoreAnalytics;
  private readonly performances: PerformanceInput[];
  private readonly generatedAt = new Date().toISOString();

  constructor(today: string) {
    ({ dataset: this.dataset, analytics: this.analytics, performances: this.performances } = demoState(today));
  }

  private records(): EventRecord[] {
    return this.dataset.events
      .map((b) => toRecord(b, this.dataset, this.analytics, this.generatedAt))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async listActiveEvents(): Promise<EventRecord[]> {
    return this.records();
  }

  async searchEvents(query: string, limit: number): Promise<EventRecord[]> {
    const q = query.toLowerCase();
    return this.records()
      .filter((e) => [e.name, e.town, e.region].some((f) => f?.toLowerCase().includes(q)))
      .slice(0, limit);
  }

  async getEvent(idOrSlug: string, today: string): Promise<EventDetailRecord | null> {
    const bundle = this.dataset.events.find((b) => b.id === idOrSlug || b.def.slug === idOrSlug);
    if (!bundle) return null;
    // Window (today - 90, today], matching EventScore's window definition.
    const windowStart = addDays(today, -89);
    const { facilities } = bundle.def;

    return {
      ...toRecord(bundle, this.dataset, this.analytics, this.generatedAt),
      startLocationText: bundle.def.startLocationText,
      startTime: '09:00',
      officialUrl: null,
      active: true,
      facilities: {
        parking: lower(facilities.parking),
        toilets: lower(facilities.toilets),
        cafe: lower(facilities.cafe),
        dogs: lower(facilities.dogs),
        buggies: lower(facilities.buggies),
        accessibility: lower(facilities.accessibility),
      },
      lastUpdated: this.generatedAt,
      recentOccurrences: toOccurrenceSummaries(bundle).reverse().slice(0, RECENT_OCCURRENCES),
      occurrencesLast90Days: bundle.occurrences.filter(
        (o) => o.status === 'COMPLETED' && o.date >= windowStart && o.date <= today,
      ).length,
    };
  }

  async findEventId(idOrSlug: string): Promise<string | null> {
    return this.dataset.events.find((b) => b.id === idOrSlug || b.def.slug === idOrSlug)?.id ?? null;
  }

  async listOccurrences(eventId: string): Promise<OccurrenceSummary[]> {
    const bundle = this.dataset.events.find((b) => b.id === eventId);
    return bundle ? toOccurrenceSummaries(bundle).reverse() : [];
  }

  async listPlacementInputs(
    timeSeconds: number,
    eventIds: string[] | null,
    from: string | null,
    to: string,
  ): Promise<PlacementOccurrenceInput[]> {
    const inputs: PlacementOccurrenceInput[] = [];
    for (const b of this.dataset.events) {
      if (eventIds && !eventIds.includes(b.id)) continue;
      for (const o of b.occurrences) {
        if (o.date > to || (from != null && o.date < from)) continue;
        // Results are sorted by time: binary-search the first index at or after a time.
        const firstIndexAtOrAfter = (t: number) => {
          let lo = 0;
          let hi = o.results.length;
          while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if (o.results[mid]!.finishTimeSeconds < t) lo = mid + 1;
            else hi = mid;
          }
          return lo;
        };
        const faster = firstIndexAtOrAfter(timeSeconds);
        const equal = firstIndexAtOrAfter(timeSeconds + 1) - faster;
        inputs.push({
          eventId: b.id,
          date: o.date,
          status: lower(o.status),
          // Mirrors the seed: completed demo occurrences are VALID.
          dataQuality: o.status === 'COMPLETED' ? 'valid' : 'unvalidated',
          participantCount: o.participantCount,
          resultCount: o.results.length,
          fasterCount: faster,
          equalCount: equal,
        });
      }
    }
    return inputs;
  }

  async getAnalytics(eventId: string, windowDays: number) {
    return {
      competition: this.analytics.competition.get(eventId)?.get(windowDays) ?? null,
      difficulty: this.analytics.difficulty.get(eventId) ?? null,
      courseSpeed: speedOf(this.analytics, eventId),
      pb: pbOf(this.analytics, eventId),
    };
  }

  async listCourseFactors(): Promise<CourseFactorResult[]> {
    return [...this.analytics.courseFactors.values()];
  }

  async listPerformances(from: string | null, to: string): Promise<PerformanceInput[]> {
    return this.performances.filter((p) => p.date <= to && (from == null || p.date >= from));
  }

  async listCompetitionInputs(to: string) {
    return demoCompetitionInputs(this.dataset).filter((o) => o.date <= to);
  }

  async getUser(userId: string): Promise<UserRecord | null> {
    const u = this.dataset.user;
    if (userId !== u.id) return null;
    return {
      id: u.id,
      displayName: u.displayName,
      homeLat: u.homeLat,
      homeLon: u.homeLon,
      homeLabel: u.homeLabel,
      defaultTravelMinutes: u.defaultTravelMinutes,
      lifetimePbSeconds: u.lifetimePbSeconds,
      recentPbSeconds: u.recentPbSeconds,
      current5kEstimateSeconds: u.current5kEstimateSeconds,
      preferredGoal: 'pb',
      isDemo: true,
      lifetimePbEvent: this.eventRef(u.lifetimePbEventId),
      recentPbEvent: this.eventRef(u.recentPbEventId),
      events: u.history.map((h) => ({
        eventId: h.slug,
        visited: true,
        favourite: h.favourite,
        visitCount: h.visitCount,
        personalBestSeconds: h.personalBestSeconds,
      })),
    };
  }

  private eventRef(id: string | null) {
    const b = this.dataset.events.find((e) => e.id === id);
    return b ? { id: b.id, name: b.def.name } : null;
  }

  async ping(): Promise<boolean> {
    return true;
  }

  async close(): Promise<void> {}
}
