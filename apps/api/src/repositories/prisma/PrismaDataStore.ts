import { addDays, type OccurrenceSummary } from '@runsaturday/shared';
import { DEFAULT_SCORE_WINDOW_DAYS } from '../../config/analysis';
import type { PlacementOccurrenceInput } from '../../domain/placementEngine';
import type { Db } from '../../db/prisma';
import { Prisma } from '../../generated/prisma/client';
import type { DataStore, EventDetailRecord, EventRecord, UserRecord } from '../DataStore';
import { mapEvent, mapFacility, mapGoal, mapOccurrence } from './mappers';

const RECENT_OCCURRENCES = 12;

export class PrismaDataStore implements DataStore {
  readonly kind = 'database' as const;

  constructor(
    private readonly db: Db,
    private readonly activeScoreVersion: string,
  ) {}

  /** The most recent snapshot for the active calculation version in the default window. */
  private scoreInclude() {
    return {
      scores: {
        where: { calculationVersion: this.activeScoreVersion, windowDays: DEFAULT_SCORE_WINDOW_DAYS },
        orderBy: { asOfDate: 'desc' },
        take: 1,
      },
    } as const;
  }

  async listActiveEvents(): Promise<EventRecord[]> {
    const events = await this.db.event.findMany({
      where: { active: true },
      include: this.scoreInclude(),
      orderBy: { name: 'asc' },
    });
    return events.map((e) => mapEvent(e, e.scores[0]));
  }

  async searchEvents(query: string, limit: number): Promise<EventRecord[]> {
    const contains = { contains: query, mode: 'insensitive' as const };
    const events = await this.db.event.findMany({
      where: { active: true, OR: [{ name: contains }, { town: contains }, { region: contains }] },
      include: this.scoreInclude(),
      orderBy: { name: 'asc' },
      take: limit,
    });
    return events.map((e) => mapEvent(e, e.scores[0]));
  }

  async getEvent(idOrSlug: string, today: string): Promise<EventDetailRecord | null> {
    const event = await this.db.event.findFirst({
      where: { OR: [{ id: idOrSlug }, { slug: idOrSlug }] },
      include: {
        ...this.scoreInclude(),
        occurrences: { orderBy: { date: 'desc' }, take: RECENT_OCCURRENCES },
      },
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

    return {
      ...mapEvent(event, event.scores[0]),
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
      { eventId: string; date: string; status: string; dataQuality: string; participantCount: number | null; resultCount: number; fasterCount: number }[]
    >`
      SELECT o."eventId",
             to_char(o.date, 'YYYY-MM-DD') AS date,
             o.status::text AS status,
             o."dataQuality"::text AS "dataQuality",
             o."participantCount",
             COUNT(r.id)::int AS "resultCount",
             (COUNT(r.id) FILTER (WHERE r."finishTimeSeconds" < ${timeSeconds}))::int AS "fasterCount"
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
    }));
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
