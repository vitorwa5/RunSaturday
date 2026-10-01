/**
 * Recalculates core analytics and stores them as EventScore snapshots, one row per
 * (event, version, windowDays, asOfDate). Designed to run as a scheduled backend job;
 * re-running for the same asOfDate replaces that day's snapshots and leaves earlier
 * snapshots untouched (history for reproducibility and trend charts).
 */
import type { Db } from '../db/prisma';
import { Prisma } from '../generated/prisma/client';
import { queryCompetitionInputs } from '../repositories/prisma/PrismaDataStore';
import { computeCoreAnalytics } from './core';
import type { CourseFacts } from './difficulty';
import { COMPETITION_VERSION, DIFFICULTY_VERSION, STRUCTURAL_WINDOW } from './versions';

const toDate = (iso: string) => new Date(`${iso}T00:00:00Z`);
const LEVEL = { high: 'HIGH', medium: 'MEDIUM', low: 'LOW', insufficient: 'INSUFFICIENT' } as const;

export interface RecalculationSummary {
  asOfDate: string;
  events: number;
  competitionSnapshots: number;
  difficultySnapshots: number;
}

export async function recalculateAnalytics(db: Db, asOfDate: string): Promise<RecalculationSummary> {
  const events = await db.event.findMany({
    where: { active: true },
    select: { id: true, elevationM: true, surface: true, courseType: true, laps: true },
    orderBy: { id: 'asc' },
  });
  const courses: CourseFacts[] = events.map((e) => ({
    eventId: e.id,
    elevationM: e.elevationM,
    surface: e.surface.toLowerCase() as CourseFacts['surface'],
    courseType: e.courseType.toLowerCase() as CourseFacts['courseType'],
    laps: e.laps,
  }));
  const inputs = await queryCompetitionInputs(db, asOfDate);
  const core = computeCoreAnalytics(courses, inputs, asOfDate);

  const writes: Prisma.PrismaPromise<unknown>[] = [];
  const upsert = (eventId: string, version: string, windowDays: number, data: Omit<Prisma.EventScoreUncheckedCreateInput, 'eventId' | 'calculationVersion' | 'windowDays' | 'asOfDate'>) =>
    writes.push(
      db.eventScore.upsert({
        where: { eventId_calculationVersion_windowDays_asOfDate: { eventId, calculationVersion: version, windowDays, asOfDate: toDate(asOfDate) } },
        create: { eventId, calculationVersion: version, windowDays, asOfDate: toDate(asOfDate), ...data },
        update: { ...data, calculatedAt: new Date() },
      }),
    );

  let competitionSnapshots = 0;
  for (const [eventId, byWindow] of core.competition) {
    for (const [windowDays, b] of byWindow) {
      upsert(eventId, COMPETITION_VERSION, windowDays, {
        competitionScore: b.value,
        competitionConfidence: LEVEL[b.confidence.level],
        sampleSize: b.sampleSize,
        components: { breakdown: b } as unknown as Prisma.InputJsonValue,
      });
      competitionSnapshots++;
    }
  }
  for (const [eventId, b] of core.difficulty) {
    upsert(eventId, DIFFICULTY_VERSION, STRUCTURAL_WINDOW, {
      difficultyScore: b.value,
      sampleSize: 0,
      components: { breakdown: b } as unknown as Prisma.InputJsonValue,
    });
  }
  await db.$transaction(writes);
  return { asOfDate, events: events.length, competitionSnapshots, difficultySnapshots: core.difficulty.size };
}
