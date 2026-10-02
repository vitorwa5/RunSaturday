import { addDays, type OccurrenceSummary } from '@runsaturday/shared';
import { DEFAULT_SCORE_WINDOW_DAYS } from '../../config/analysis';
import type { PlacementOccurrenceInput } from '../../domain/placementEngine';
import type { Db } from '../../db/prisma';
import { Prisma } from '../../generated/prisma/client';
import {
  DuplicatePerformanceError,
  type DataStore,
  type EventDetailRecord,
  type EventRecord,
  type NewPerformance,
  type PerformancePatch,
  type PerformanceRecord,
  type StoredUser,
} from '../DataStore';
import type { PerformanceSource, PerformanceType, RunnerForm } from '@runsaturday/shared';
import { cleanExternalEventName, performanceDuplicateKey } from '../../domain/performanceKey';
import { breakdownOf, isoDate, mapEvent, mapFacility, mapGoal, mapOccurrence, type EventSnapshots } from './mappers';
import type { CompetitionBreakdown, DifficultyBreakdown, PbBreakdown } from '@runsaturday/shared';
import { COURSE_SPEED_V1, type CourseFactorResult, type PerformanceInput } from '../../analytics/courseSpeed';
import { toCourseSpeedBreakdown } from '../../analytics/dto';
import type { CourseFactorSnapshot, EventScore } from '../../generated/prisma/client';
import type { CompetitionOccurrenceInput } from '../../analytics/competition';
import { COMPETITION_VERSION, COURSE_SPEED_VERSION, DEFAULT_ANALYTICS_WINDOW, DIFFICULTY_VERSION, PB_VERSION, STRUCTURAL_WINDOW } from '../../analytics/versions';
import type { Event } from '../../generated/prisma/client';

const RECENT_OCCURRENCES = 12;

const PERFORMANCE_INCLUDE = { event: { select: { name: true } } } as const;
type PerformanceSourceDb = 'MANUAL' | 'CSV' | 'PARKRUN_API' | 'GARMIN' | 'STRAVA';
type PerformanceTypeDb = 'PARKRUN' | 'ROAD_RACE' | 'OTHER_RACE';
const PERFORMANCE_TYPE_DB: Record<PerformanceType, PerformanceTypeDb> = { parkrun: 'PARKRUN', road_race: 'ROAD_RACE', other_race: 'OTHER_RACE' };
const PERFORMANCE_SOURCE_DB: Record<PerformanceSource, PerformanceSourceDb> = {
  manual: 'MANUAL',
  csv: 'CSV',
  parkrun_api: 'PARKRUN_API',
  garmin: 'GARMIN',
  strava: 'STRAVA',
};

function mapPerformance(row: {
  id: string;
  userId: string;
  eventId: string | null;
  event: { name: string } | null;
  externalEventName: string | null;
  performanceType: PerformanceTypeDb;
  distanceMeters: number;
  date: Date;
  finishTimeSeconds: number;
  source: PerformanceSourceDb;
  externalResultId: string | null;
  verified: boolean;
}): PerformanceRecord {
  return {
    id: row.id,
    userId: row.userId,
    eventId: row.eventId,
    eventName: row.event?.name ?? null,
    externalEventName: row.externalEventName,
    performanceType: row.performanceType.toLowerCase() as PerformanceType,
    distanceMeters: row.distanceMeters,
    date: isoDate(row.date),
    finishTimeSeconds: row.finishTimeSeconds,
    source: row.source.toLowerCase() as PerformanceSource,
    externalResultId: row.externalResultId,
    verified: row.verified,
  };
}

/** Columns for a create/update, including the deterministic duplicate key. */
function performanceData(p: PerformancePatch) {
  const externalEventName = p.externalEventName != null ? cleanExternalEventName(p.externalEventName) : null;
  return {
    eventId: p.eventId,
    externalEventName,
    performanceType: PERFORMANCE_TYPE_DB[p.performanceType],
    distanceMeters: p.distanceMeters,
    date: new Date(`${p.date}T00:00:00Z`),
    finishTimeSeconds: p.finishTimeSeconds,
    duplicateKey: performanceDuplicateKey({ ...p, externalEventName }),
  };
}

/** Postgres unique violation (P2002) on (userId, duplicateKey) → DuplicatePerformanceError. */
async function uniqueOrDuplicate<T>(write: () => Promise<T>): Promise<T> {
  try {
    return await write();
  } catch (error) {
    if ((error as { code?: string }).code === 'P2002') throw new DuplicatePerformanceError();
    throw error;
  }
}

export class PrismaDataStore implements DataStore {
  readonly kind = 'database' as const;

  constructor(
    private readonly db: Db,
    private readonly activeScoreVersion: string,
  ) {}

  /**
   * Latest snapshot per event for: the active PB version (90 days), Competition V1 (given
   * window) and Difficulty V1 (structural). One query for any number of events.
   */
  private async snapshots(eventIds: string[], competitionWindow = DEFAULT_ANALYTICS_WINDOW): Promise<Map<string, EventSnapshots>> {
    const [rows, factors] = await Promise.all([
      this.db.eventScore.findMany({
        where: {
          eventId: { in: eventIds },
          OR: [
            { calculationVersion: this.activeScoreVersion, windowDays: DEFAULT_SCORE_WINDOW_DAYS },
            { calculationVersion: PB_VERSION, windowDays: COURSE_SPEED_V1.WINDOW_DAYS },
            { calculationVersion: COMPETITION_VERSION, windowDays: competitionWindow },
            { calculationVersion: DIFFICULTY_VERSION, windowDays: STRUCTURAL_WINDOW },
          ],
        },
        orderBy: [{ asOfDate: 'desc' }, { calculatedAt: 'desc' }],
      }),
      this.latestFactorRows(eventIds),
    ]);
    const result = new Map<string, EventSnapshots>(eventIds.map((id) => [id, {}]));
    const SLOT: Record<string, keyof EventSnapshots> = {
      [PB_VERSION]: 'pb',
      [COMPETITION_VERSION]: 'competition',
      [DIFFICULTY_VERSION]: 'difficulty',
    };
    for (const row of rows) {
      const entry = result.get(row.eventId)!;
      const slot = SLOT[row.calculationVersion] ?? 'legacy';
      (entry[slot] as EventScore | undefined) ??= row; // rows are newest first
    }
    for (const f of factors) result.get(f.eventId)!.courseSpeed = toCourseSpeedBreakdown(factorFromRow(f));
    return result;
  }

  /** Course factor rows from the latest calculation run only (bootstrap draws align within a run). */
  private async latestFactorRows(eventIds?: string[]) {
    const latest = await this.db.courseFactorSnapshot.findFirst({
      where: { version: COURSE_SPEED_VERSION, windowDays: COURSE_SPEED_V1.WINDOW_DAYS },
      orderBy: { asOfDate: 'desc' },
      select: { asOfDate: true },
    });
    if (!latest) return [];
    return this.db.courseFactorSnapshot.findMany({
      where: {
        version: COURSE_SPEED_VERSION,
        windowDays: COURSE_SPEED_V1.WINDOW_DAYS,
        asOfDate: latest.asOfDate,
        ...(eventIds ? { eventId: { in: eventIds } } : {}),
      },
      orderBy: { eventId: 'asc' },
    });
  }

  async listCourseFactors(): Promise<CourseFactorResult[]> {
    return (await this.latestFactorRows()).map(factorFromRow);
  }

  async listPerformances(from: string | null, to: string): Promise<PerformanceInput[]> {
    return queryPerformances(this.db, from, to);
  }

  private async withScores(events: Event[]): Promise<EventRecord[]> {
    const snaps = await this.snapshots(events.map((e) => e.id));
    return events.map((e) => mapEvent(e, snaps.get(e.id)!));
  }

  async listActiveEvents(): Promise<EventRecord[]> {
    return this.withScores(await this.db.event.findMany({ where: { active: true }, orderBy: { name: 'asc' } }));
  }

  async searchEvents(query: string, limit: number): Promise<EventRecord[]> {
    const contains = { contains: query, mode: 'insensitive' as const };
    return this.withScores(
      await this.db.event.findMany({
        where: { active: true, OR: [{ name: contains }, { town: contains }, { region: contains }] },
        orderBy: { name: 'asc' },
        take: limit,
      }),
    );
  }

  async getEvent(idOrSlug: string, today: string): Promise<EventDetailRecord | null> {
    const event = await this.db.event.findFirst({
      where: { OR: [{ id: idOrSlug }, { slug: idOrSlug }] },
      include: { occurrences: { orderBy: { date: 'desc' }, take: RECENT_OCCURRENCES } },
    });
    if (!event) return null;

    const occurrencesLast90Days = await this.db.eventOccurrence.count({
      where: {
        eventId: event.id,
        status: 'COMPLETED',
        // Window (today - 90, today], matching EventScore's window definition.
        date: { gte: new Date(`${addDays(today, -89)}T00:00:00Z`), lte: new Date(`${today}T00:00:00Z`) },
      },
    });

    const snaps = await this.snapshots([event.id]);
    return {
      ...mapEvent(event, snaps.get(event.id)!),
      startLocationText: event.startLocationText,
      startTime: event.startTime,
      officialUrl: event.officialUrl,
      active: event.active,
      facilities: {
        parking: mapFacility(event.parking),
        toilets: mapFacility(event.toilets),
        cafe: mapFacility(event.cafe),
        dogs: mapFacility(event.dogs),
        buggies: mapFacility(event.buggies),
        accessibility: mapFacility(event.accessibility),
      },
      lastUpdated: event.updatedAt.toISOString(),
      recentOccurrences: event.occurrences.map(mapOccurrence),
      occurrencesLast90Days,
    };
  }

  async findEventId(idOrSlug: string): Promise<string | null> {
    const event = await this.db.event.findFirst({ where: { OR: [{ id: idOrSlug }, { slug: idOrSlug }] }, select: { id: true } });
    return event?.id ?? null;
  }

  async listOccurrences(eventId: string): Promise<OccurrenceSummary[]> {
    const rows = await this.db.eventOccurrence.findMany({ where: { eventId }, orderBy: { date: 'desc' } });
    return rows.map(mapOccurrence);
  }

  async listPlacementInputs(
    timeSeconds: number,
    eventIds: string[] | null,
    from: string | null,
    to: string,
  ): Promise<PlacementOccurrenceInput[]> {
    if (eventIds && eventIds.length === 0) return [];
    // One grouped pass; uses the (occurrenceId, finishTimeSeconds) index on Result.
    const rows = await this.db.$queryRaw<
      { eventId: string; date: string; status: string; dataQuality: string; participantCount: number | null; resultCount: number; fasterCount: number; equalCount: number }[]
    >`
      SELECT o."eventId",
             to_char(o.date, 'YYYY-MM-DD') AS date,
             o.status::text AS status,
             o."dataQuality"::text AS "dataQuality",
             o."participantCount",
             COUNT(r.id)::int AS "resultCount",
             (COUNT(r.id) FILTER (WHERE r."finishTimeSeconds" < ${timeSeconds}))::int AS "fasterCount",
             (COUNT(r.id) FILTER (WHERE r."finishTimeSeconds" = ${timeSeconds}))::int AS "equalCount"
      FROM "EventOccurrence" o
      LEFT JOIN "Result" r ON r."occurrenceId" = o.id
      WHERE o.date <= ${to}::date
        ${from ? Prisma.sql`AND o.date >= ${from}::date` : Prisma.empty}
        ${eventIds ? Prisma.sql`AND o."eventId" IN (${Prisma.join(eventIds)})` : Prisma.empty}
      GROUP BY o.id
      ORDER BY o."eventId", o.date DESC`;
    return rows.map((r) => ({
      eventId: r.eventId,
      date: r.date,
      status: r.status.toLowerCase() as PlacementOccurrenceInput['status'],
      dataQuality: r.dataQuality.toLowerCase() as PlacementOccurrenceInput['dataQuality'],
      participantCount: r.participantCount,
      resultCount: r.resultCount,
      fasterCount: r.fasterCount,
      equalCount: r.equalCount,
    }));
  }

  async getAnalytics(eventId: string, windowDays: number) {
    const snap = (await this.snapshots([eventId], windowDays)).get(eventId)!;
    return {
      competition: breakdownOf<CompetitionBreakdown>(snap.competition),
      difficulty: breakdownOf<DifficultyBreakdown>(snap.difficulty),
      courseSpeed: snap.courseSpeed ?? null,
      pb: breakdownOf<PbBreakdown>(snap.pb),
    };
  }

  async listCompetitionInputs(to: string): Promise<CompetitionOccurrenceInput[]> {
    return queryCompetitionInputs(this.db, to);
  }

  async getUser(userId: string): Promise<StoredUser | null> {
    const user = await this.db.user.findUnique({ where: { id: userId }, include: { events: { where: { favourite: true }, select: { eventId: true } } } });
    if (!user) return null;
    return {
      id: user.id,
      displayName: user.displayName,
      homeLat: user.homeLat,
      homeLon: user.homeLon,
      homeLabel: user.homeLabel,
      defaultTravelMinutes: user.defaultTravelMinutes,
      preferredGoal: mapGoal(user.preferredGoal),
      isDemo: user.isDemo,
      favouriteEventIds: user.events.map((ue) => ue.eventId).sort(),
    };
  }

  // Personal performances: every query is filtered by userId.

  async listUserPerformances(userId: string, filter: { eventId?: string } = {}): Promise<PerformanceRecord[]> {
    const rows = await this.db.userPerformance.findMany({
      where: { userId, ...(filter.eventId ? { eventId: filter.eventId } : {}) },
      include: PERFORMANCE_INCLUDE,
      orderBy: [{ date: 'desc' }, { id: 'asc' }],
    });
    return rows.map(mapPerformance);
  }

  async getUserPerformance(userId: string, id: string): Promise<PerformanceRecord | null> {
    const row = await this.db.userPerformance.findFirst({ where: { id, userId }, include: PERFORMANCE_INCLUDE });
    return row ? mapPerformance(row) : null;
  }

  async createUserPerformance(userId: string, input: NewPerformance): Promise<PerformanceRecord> {
    return uniqueOrDuplicate(async () =>
      mapPerformance(
        await this.db.userPerformance.create({
          data: { userId, ...performanceData(input), source: PERFORMANCE_SOURCE_DB[input.source] },
          include: PERFORMANCE_INCLUDE,
        }),
      ),
    );
  }

  async updateUserPerformance(userId: string, id: string, patch: PerformancePatch): Promise<PerformanceRecord | null> {
    // Scoped by userId: another user's id is simply "not found".
    const existing = await this.db.userPerformance.findFirst({ where: { id, userId }, select: { id: true } });
    if (!existing) return null;
    return uniqueOrDuplicate(async () =>
      mapPerformance(
        await this.db.userPerformance.update({
          where: { id: existing.id },
          data: performanceData(patch),
          include: PERFORMANCE_INCLUDE,
        }),
      ),
    );
  }

  async deleteUserPerformance(userId: string, id: string): Promise<boolean> {
    const { count } = await this.db.userPerformance.deleteMany({ where: { id, userId } });
    return count > 0;
  }

  async getRunnerFormSnapshot(userId: string, distanceMeters: number, version: string, asOfDate: string): Promise<RunnerForm | null> {
    const row = await this.db.runnerFormSnapshot.findUnique({
      where: { userId_distanceMeters_calculationVersion_asOfDate: { userId, distanceMeters, calculationVersion: version, asOfDate: new Date(`${asOfDate}T00:00:00Z`) } },
      select: { components: true },
    });
    // The full model output is stored in `components`; the columns duplicate its headline values.
    return row ? (row.components as unknown as RunnerForm) : null;
  }

  async saveRunnerFormSnapshot(userId: string, form: RunnerForm): Promise<void> {
    const key = { userId, distanceMeters: form.distanceMeters, calculationVersion: form.version, asOfDate: new Date(`${form.asOfDate}T00:00:00Z`) };
    const data = {
      status: form.status.toUpperCase() as 'ESTIMATE' | 'INDICATIVE' | 'UNAVAILABLE',
      formSeconds: form.formSeconds,
      indicativeSeconds: form.indicativeSeconds,
      confidenceScore: form.confidence.score,
      confidence: form.confidence.level.toUpperCase() as 'HIGH' | 'MEDIUM' | 'LOW' | 'INSUFFICIENT',
      trend: form.trend.direction.toUpperCase() as 'IMPROVING' | 'STABLE' | 'DECLINING' | 'LIMITED',
      sampleSize: form.sampleSize,
      eventCount: form.eventCount,
      components: form as unknown as Prisma.InputJsonValue,
    };
    await this.db.runnerFormSnapshot.upsert({ where: { userId_distanceMeters_calculationVersion_asOfDate: key }, create: { ...key, ...data }, update: data });
  }

  async ping(): Promise<boolean> {
    try {
      await this.db.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }

  async close(): Promise<void> {
    await this.db.$disconnect();
  }
}

/**
 * Placing times for every occurrence up to `to`, read from Result rows (the source of truth):
 * winner, 3rd, 5th, 10th and the top-10% cutoff (position ceil(0.10 × result count)).
 */
export async function queryCompetitionInputs(db: Db, to: string): Promise<CompetitionOccurrenceInput[]> {
  const rows = await db.$queryRaw<
    {
      eventId: string;
      date: string;
      status: string;
      dataQuality: string;
      participantCount: number | null;
      resultCount: number;
      winnerSeconds: number | null;
      thirdSeconds: number | null;
      fifthSeconds: number | null;
      tenthSeconds: number | null;
      fieldDepthSeconds: number | null;
    }[]
  >`
    WITH counts AS (
      SELECT o.id, COUNT(r.id)::int AS n
      FROM "EventOccurrence" o
      LEFT JOIN "Result" r ON r."occurrenceId" = o.id
      WHERE o.date <= ${to}::date
      GROUP BY o.id
    )
    SELECT o."eventId",
           to_char(o.date, 'YYYY-MM-DD') AS date,
           o.status::text AS status,
           o."dataQuality"::text AS "dataQuality",
           o."participantCount",
           c.n AS "resultCount",
           MAX(r."finishTimeSeconds") FILTER (WHERE r.position = 1) AS "winnerSeconds",
           MAX(r."finishTimeSeconds") FILTER (WHERE r.position = 3) AS "thirdSeconds",
           MAX(r."finishTimeSeconds") FILTER (WHERE r.position = 5) AS "fifthSeconds",
           MAX(r."finishTimeSeconds") FILTER (WHERE r.position = 10) AS "tenthSeconds",
           MAX(r."finishTimeSeconds") FILTER (WHERE r.position = GREATEST(1, CEIL(0.1 * c.n)::int)) AS "fieldDepthSeconds"
    FROM "EventOccurrence" o
    JOIN counts c ON c.id = o.id
    LEFT JOIN "Result" r ON r."occurrenceId" = o.id
    GROUP BY o.id, c.n
    ORDER BY o."eventId", o.date`;
  return rows.map((r) => ({
    eventId: r.eventId,
    date: r.date,
    status: r.status.toLowerCase() as CompetitionOccurrenceInput['status'],
    dataQuality: r.dataQuality.toLowerCase() as CompetitionOccurrenceInput['dataQuality'],
    participantCount: r.participantCount,
    resultCount: r.resultCount,
    winnerSeconds: r.winnerSeconds,
    thirdSeconds: r.thirdSeconds,
    fifthSeconds: r.fifthSeconds,
    tenthSeconds: r.tenthSeconds,
    fieldDepthSeconds: r.resultCount > 0 ? r.fieldDepthSeconds : null,
  }));
}

/** Rebuild the internal factor result from a stored snapshot (breakdown JSON + bootstrap column). */
export function factorFromRow(row: CourseFactorSnapshot): CourseFactorResult {
  const stored = row.breakdown as unknown as Omit<CourseFactorResult, 'bootstrap'>;
  return { ...stored, bootstrap: row.bootstrapLogFactors };
}

/**
 * Results with a pseudonymous athlete key from completed, validated occurrences in [from, to].
 * Completeness (result rows = participant count) is checked against the occurrence inputs by
 * the caller (usablePerformances).
 */
export async function queryPerformances(db: Db, from: string | null, to: string): Promise<PerformanceInput[]> {
  const rows = await db.$queryRaw<{ athleteKey: string; eventId: string; date: string; seconds: number }[]>`
    SELECT r."athleteKey", o."eventId", to_char(o.date, 'YYYY-MM-DD') AS date, r."finishTimeSeconds" AS seconds
    FROM "Result" r
    JOIN "EventOccurrence" o ON o.id = r."occurrenceId"
    WHERE r."athleteKey" IS NOT NULL
      AND o.status = 'COMPLETED'
      AND o."dataQuality" = 'VALID'
      AND o.date <= ${to}::date
      ${from ? Prisma.sql`AND o.date >= ${from}::date` : Prisma.empty}
    ORDER BY r."athleteKey", o."eventId", o.date`;
  return rows;
}
