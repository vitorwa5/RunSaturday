/**
 * Recalculates core analytics and stores them as EventScore snapshots, one row per
 * (event, version, windowDays, asOfDate). Designed to run as a scheduled backend job;
 * re-running for the same asOfDate replaces that day's snapshots and leaves earlier
 * snapshots untouched (history for reproducibility and trend charts).
 */
import type { Db } from '../db/prisma';
import { Prisma } from '../generated/prisma/client';
import { windowStart } from '../domain/confidence';
import { queryCompetitionInputs, queryPerformances } from '../repositories/prisma/PrismaDataStore';
import { computeCoreAnalytics, usablePerformances } from './core';
import { COURSE_SPEED_V1 } from './courseSpeed';
import { toPbBreakdown } from './dto';
import type { CourseFacts } from './difficulty';
import { COMPETITION_VERSION, COURSE_SPEED_VERSION, DIFFICULTY_VERSION, PB_VERSION, STRUCTURAL_WINDOW } from './versions';

const toDate = (iso: string) => new Date(`${iso}T00:00:00Z`);
const LEVEL = { high: 'HIGH', medium: 'MEDIUM', low: 'LOW', insufficient: 'INSUFFICIENT' } as const;

export interface RecalculationSummary {
  asOfDate: string;
  events: number;
  competitionSnapshots: number;
  difficultySnapshots: number;
  courseFactorSnapshots: number;
  pbSnapshots: number;
  fittedFactors: number;
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
  const rawPerformances = await queryPerformances(db, windowStart(asOfDate, COURSE_SPEED_V1.WINDOW_DAYS), asOfDate);
  const performances = usablePerformances(
    rawPerformances.map((p) => ({ ...p, occurrenceKey: `${p.eventId}|${p.date}` })),
    inputs,
  );
  // Dependency order: course factors → difficulty → competition → PB (see computeCoreAnalytics).
  const core = computeCoreAnalytics(courses, inputs, performances, asOfDate);

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
  for (const [eventId, f] of core.courseFactors) {
    const { bootstrap, ...stored } = f;
    const data = {
      factor: f.factor,
      logFactor: f.logFactor,
      bootstrapLogFactors: bootstrap,
      matchedRunners: f.matchedRunners,
      comparisons: f.comparisons,
      connectedEvents: f.connectedEvents,
      medianGapDays: f.medianGapDays,
      dispersion: f.dispersion,
      confidence: LEVEL[f.confidence.level],
      confidenceScore: f.confidence.score,
      breakdown: stored as unknown as Prisma.InputJsonValue,
    };
    const key = { eventId, version: COURSE_SPEED_VERSION, windowDays: f.windowDays, asOfDate: toDate(asOfDate) };
    writes.push(
      db.courseFactorSnapshot.upsert({
        where: { eventId_version_windowDays_asOfDate: key },
        create: { ...key, ...data },
        update: { ...data, calculatedAt: new Date() },
      }),
    );
  }
  for (const [eventId, p] of core.pb) {
    upsert(eventId, PB_VERSION, COURSE_SPEED_V1.WINDOW_DAYS, {
      pbScore: p.value,
      pbConfidence: LEVEL[p.confidence.level],
      sampleSize: core.courseFactors.get(eventId)?.comparisons ?? 0,
      components: { breakdown: toPbBreakdown(p) } as unknown as Prisma.InputJsonValue,
    });
  }
  await db.$transaction(writes);
  return {
    asOfDate,
    events: events.length,
    competitionSnapshots,
    difficultySnapshots: core.difficulty.size,
    courseFactorSnapshots: core.courseFactors.size,
    pbSnapshots: core.pb.size,
    fittedFactors: [...core.courseFactors.values()].filter((f) => f.factor != null).length,
  };
}
