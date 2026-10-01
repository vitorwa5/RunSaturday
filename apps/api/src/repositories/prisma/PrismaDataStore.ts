import { addDays, type OccurrenceSummary } from '@runsaturday/shared';
import { DEFAULT_SCORE_WINDOW_DAYS } from '../../config/analysis';
import type { PlacementOccurrenceInput } from '../../domain/placementEngine';
import type { Db } from '../../db/prisma';
import { Prisma } from '../../generated/prisma/client';
import type { DataStore, EventDetailRecord, EventRecord, UserRecord } from '../DataStore';
import { breakdownOf, mapEvent, mapFacility, mapGoal, mapOccurrence, type EventSnapshots } from './mappers';
import type { CompetitionBreakdown, DifficultyBreakdown } from '@runsaturday/shared';
import type { CompetitionOccurrenceInput } from '../../analytics/competition';
import { COMPETITION_VERSION, DEFAULT_ANALYTICS_WINDOW, DIFFICULTY_VERSION, STRUCTURAL_WINDOW } from '../../analytics/versions';
import type { Event } from '../../generated/prisma/client';

const RECENT_OCCURRENCES = 12;

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
    const rows = await this.db.eventScore.findMany({
      where: {
        eventId: { in: eventIds },
        OR: [
          { calculationVersion: this.activeScoreVersion, windowDays: DEFAULT_SCORE_WINDOW_DAYS },
          { calculationVersion: COMPETITION_VERSION, windowDays: competitionWindow },
          { calculationVersion: DIFFICULTY_VERSION, windowDays: STRUCTURAL_WINDOW },
        ],
      },
      orderBy: [{ asOfDate: 'desc' }, { calculatedAt: 'desc' }],
    });
    const result = new Map<string, EventSnapshots>(eventIds.map((id) => [id, {}]));
    for (const row of rows) {
      const entry = result.get(row.eventId)!;
      const slot = row.calculationVersion === COMPETITION_VERSION ? 'competition' : row.calculationVersion === DIFFICULTY_VERSION ? 'difficulty' : 'pb';
      entry[slot] ??= row; // rows are newest first
    }
    return result;
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
    };
  }

  async listCompetitionInputs(to: string): Promise<CompetitionOccurrenceInput[]> {
    return queryCompetitionInputs(this.db, to);
  }

  async getUser(userId: string): Promise<UserRecord | null> {
    const user = await this.db.user.findUnique({ where: { id: userId }, include: { events: true } });
    if (!user) return null;
    return {
      id: user.id,
      displayName: user.displayName,
      homeLat: user.homeLat,
      homeLon: user.homeLon,
      homeLabel: user.homeLabel,
      defaultTravelMinutes: user.defaultTravelMinutes,
      lifetimePbSeconds: user.lifetimePbSeconds,
      recentPbSeconds: user.recentPbSeconds,
      current5kEstimateSeconds: user.current5kEstimateSeconds,
      preferredGoal: mapGoal(user.preferredGoal),
      isDemo: user.isDemo,
      events: user.events.map((ue) => ({
        eventId: ue.eventId,
        visited: ue.visited,
        favourite: ue.favourite,
        visitCount: ue.visitCount,
        personalBestSeconds: ue.personalBestSeconds,
      })),
    };
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
