/**
 * In-memory DataStore backed by the DEMO dataset (fictional). Lets the UI run without
 * PostgreSQL (DATA_SOURCE=demo) and gives API tests a deterministic fixture.
 */
import { addDays, type OccurrenceSummary, type RunnerForm } from '@runsaturday/shared';
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
import { randomUUID } from 'node:crypto';
import { demoUserPerformances } from '../../demo/demoUserPerformances';
import { cleanExternalEventName, performanceDuplicateKey } from '../../domain/performanceKey';
import { byNewest } from '../../services/userPerformance';
import {
  DuplicatePerformanceError,
  type DataStore,
  type CatalogueFilter,
  type EventDetailRecord,
  type EventRecord,
  type NewPerformance,
  type PerformancePatch,
  type PerformanceRecord,
  type StoredUser,
} from '../DataStore';

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
  readonly catalogueMode = 'demo' as const;
  readonly kind = 'demo-memory' as const;
  private readonly dataset: DemoDataset;
  private readonly analytics: CoreAnalytics;
  private readonly performances: PerformanceInput[];
  /** Runner Form snapshots, keyed by user|distance|version|asOfDate; private to this instance. */
  private readonly revisions = new Map<string, number>();
  private readonly runnerForms = new Map<string, RunnerForm>();
  /** The demo user's own history; mutable, and private to this store instance. */
  private readonly userPerformances: PerformanceRecord[];
  private readonly generatedAt = new Date().toISOString();

  constructor(today: string) {
    ({ dataset: this.dataset, analytics: this.analytics, performances: this.performances } = demoState(today));
    const names = new Map(this.dataset.events.map((e) => [e.id, e.def.name]));
    this.userPerformances = demoUserPerformances(this.dataset.latestDate).map((p) => ({
      ...p,
      eventName: names.get(p.eventId) ?? p.eventId,
      source: 'manual' as const,
      externalResultId: null,
      verified: false,
    }));
  }

  private records(): EventRecord[] {
    return this.dataset.events
      .map((b) => toRecord(b, this.dataset, this.analytics, this.generatedAt))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async listActiveEvents(filter: CatalogueFilter = {}): Promise<EventRecord[]> {
    return this.records().filter((e) => (!filter.region || e.region === filter.region)
      && (!filter.countryCode || e.catalogue?.countryCode === filter.countryCode)
      && (!filter.sourceNamespace || e.catalogue?.sourceNamespace === filter.sourceNamespace));
  }

  async searchEvents(query: string, limit: number, filter: CatalogueFilter = {}): Promise<EventRecord[]> {
    const q = query.toLowerCase();
    return (await this.listActiveEvents(filter))
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

  async getUser(userId: string): Promise<StoredUser | null> {
    const u = this.dataset.user;
    if (userId !== u.id) return null;
    return {
      id: u.id,
      displayName: u.displayName,
      homeLat: u.homeLat,
      homeLon: u.homeLon,
      homeLabel: u.homeLabel,
      defaultTravelMinutes: u.defaultTravelMinutes,
      preferredGoal: 'pb',
      isDemo: true,
      favouriteEventIds: [...u.favouriteEventIds].sort(),
    };
  }

  // Personal performances: an in-memory copy per store instance, always filtered by userId.

  async listUserPerformances(userId: string, filter: { eventId?: string } = {}): Promise<PerformanceRecord[]> {
    return this.userPerformances
      .filter((p) => p.userId === userId && (filter.eventId == null || p.eventId === filter.eventId))
      .map((p) => ({ ...p }))
      .sort(byNewest);
  }

  async getUserPerformance(userId: string, id: string): Promise<PerformanceRecord | null> {
    const p = this.userPerformances.find((x) => x.userId === userId && x.id === id);
    return p ? { ...p } : null;
  }

  async createUserPerformance(userId: string, input: NewPerformance): Promise<PerformanceRecord> {
    const values = this.performanceValues(input);
    this.assertUnique(userId, values, null);
    const record: PerformanceRecord = { id: randomUUID(), userId, ...values, source: input.source, externalResultId: null, verified: false };
    this.userPerformances.push(record);
    this.invalidateForm(userId);
    return { ...record };
  }

  async updateUserPerformance(userId: string, id: string, patch: PerformancePatch): Promise<PerformanceRecord | null> {
    const p = this.userPerformances.find((x) => x.userId === userId && x.id === id);
    if (!p) return null;
    const values = this.performanceValues(patch);
    this.assertUnique(userId, values, id);
    Object.assign(p, values);
    this.invalidateForm(userId);
    return { ...p };
  }

  async deleteUserPerformance(userId: string, id: string): Promise<boolean> {
    const index = this.userPerformances.findIndex((x) => x.userId === userId && x.id === id);
    if (index < 0) return false;
    this.userPerformances.splice(index, 1);
    this.invalidateForm(userId);
    return true;
  }

  private invalidateForm(userId: string) {
    this.revisions.set(userId, (this.revisions.get(userId) ?? 0) + 1);
    for (const key of this.runnerForms.keys()) if (key.startsWith(`${userId}|`)) this.runnerForms.delete(key);
  }
  async getPerformanceRevision(userId: string) { return this.revisions.get(userId) ?? 0; }

  async getRunnerFormSnapshot(userId: string, distanceMeters: number, version: string, asOfDate: string): Promise<RunnerForm | null> {
    const form = this.runnerForms.get(`${userId}|${distanceMeters}|${version}|${asOfDate}`);
    return form ? structuredClone(form) : null;
  }

  async saveRunnerFormSnapshot(userId: string, form: RunnerForm, expectedRevision?: number): Promise<boolean> {
    if (expectedRevision != null && expectedRevision !== await this.getPerformanceRevision(userId)) return false;
    this.runnerForms.set(`${userId}|${form.distanceMeters}|${form.version}|${form.asOfDate}`, structuredClone(form));
    return true;
  }

  /** Same normalisation as the Prisma store: cleaned external name, internal name looked up. */
  private performanceValues(p: PerformancePatch) {
    const externalEventName = p.externalEventName != null ? cleanExternalEventName(p.externalEventName) : null;
    const eventName = p.eventId != null ? (this.dataset.events.find((e) => e.id === p.eventId)?.def.name ?? p.eventId) : null;
    return { ...p, externalEventName, eventName };
  }

  /** Same deterministic duplicate key as the database's unique (userId, duplicateKey) index. */
  private assertUnique(userId: string, p: PerformancePatch, exceptId: string | null) {
    const key = performanceDuplicateKey(p);
    if (this.userPerformances.some((x) => x.userId === userId && x.id !== exceptId && performanceDuplicateKey(x) === key)) {
      throw new DuplicatePerformanceError();
    }
  }

  async ping(): Promise<boolean> {
    return true;
  }

  async close(): Promise<void> {}
}
