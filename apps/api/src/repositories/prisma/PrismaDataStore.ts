import { addDays, type OccurrenceSummary } from '@runsaturday/shared';
import { DEFAULT_SCORE_WINDOW_DAYS } from '../../config/analysis';
import type { Db } from '../../db/prisma';
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
