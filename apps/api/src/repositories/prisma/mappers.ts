/** Convert Prisma rows (UPPER_CASE enums, Date objects) into API transport shapes. */
import type {
  CompetitionBreakdown,
  ConfidenceLevel,
  CourseSpeedBreakdown,
  DifficultyBreakdown,
  PbBreakdown,
  CourseType,
  DataSource,
  FacilityStatus,
  Goal,
  OccurrenceStatus,
  Surface,
} from '@runsaturday/shared';
import type { $Enums, Event, EventOccurrence, EventScore } from '../../generated/prisma/client';
import type { EventRecord } from '../DataStore';
import { assembleScores, type LegacySnapshot } from '../scoreAssembly';

const lower = <T extends string>(value: string) => value.toLowerCase() as T;

export const mapSurface = (s: $Enums.Surface) => lower<Surface>(s);
export const mapCourseType = (c: $Enums.CourseType) => lower<CourseType>(c);
export const mapFacility = (f: $Enums.FacilityStatus) => lower<FacilityStatus>(f);
export const mapConfidence = (c: $Enums.ConfidenceLevel) => lower<ConfidenceLevel>(c);
export const mapSource = (s: $Enums.DataSource) => lower<DataSource>(s);
export const mapOccurrenceStatus = (s: $Enums.OccurrenceStatus) => lower<OccurrenceStatus>(s);
export const mapGoal = (g: $Enums.Goal) => lower<Goal>(g);

/** ISO calendar date from a @db.Date column (Prisma returns midnight UTC). */
export const isoDate = (d: Date) => d.toISOString().slice(0, 10);

/** Latest snapshots behind an event's scores. */
export interface EventSnapshots {
  /** Legacy demo snapshot (average participants, Gem base). */
  legacy?: EventScore;
  pb?: EventScore;
  competition?: EventScore;
  difficulty?: EventScore;
  courseSpeed?: CourseSpeedBreakdown;
}

/** The breakdown persisted in EventScore.components by the analytics job. */
export function breakdownOf<T extends CompetitionBreakdown | DifficultyBreakdown | PbBreakdown>(row: EventScore | undefined): T | null {
  const components = row?.components as { breakdown?: T } | null | undefined;
  return components?.breakdown ?? null;
}

function legacySnapshot(row: EventScore | undefined): LegacySnapshot | null {
  if (!row) return null;
  return {
    gemBaseScore: row.gemBaseScore,
    sampleSize: row.sampleSize,
    windowDays: row.windowDays,
    asOfDate: isoDate(row.asOfDate),
    calculatedAt: row.calculatedAt.toISOString(),
  };
}

export function mapEvent(event: Event, snapshots: EventSnapshots): EventRecord {
  const legacy = snapshots.legacy;
  return {
    id: event.id,
    slug: event.slug,
    name: event.name,
    town: event.town,
    region: event.region,
    country: event.country,
    latitude: event.latitude,
    longitude: event.longitude,
    surface: mapSurface(event.surface),
    courseType: mapCourseType(event.courseType),
    laps: event.laps,
    elevationM: event.elevationM,
    averageParticipants: legacy?.averageParticipants != null ? Math.round(legacy.averageParticipants) : null,
    source: mapSource(event.source),
    scores: assembleScores(
      legacySnapshot(legacy),
      breakdownOf<PbBreakdown>(snapshots.pb),
      breakdownOf<CompetitionBreakdown>(snapshots.competition),
      breakdownOf<DifficultyBreakdown>(snapshots.difficulty),
      snapshots.courseSpeed ?? null,
    ),
  };
}

export function mapOccurrence(o: EventOccurrence) {
  return {
    date: isoDate(o.date),
    status: mapOccurrenceStatus(o.status),
    participantCount: o.participantCount,
    winnerTimeSeconds: o.winnerTimeSeconds,
    thirdTimeSeconds: o.thirdTimeSeconds,
    fifthTimeSeconds: o.fifthTimeSeconds,
    tenthTimeSeconds: o.tenthTimeSeconds,
  };
}
