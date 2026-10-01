/** Convert Prisma rows (UPPER_CASE enums, Date objects) into API transport shapes. */
import type {
  ConfidenceLevel,
  CourseType,
  DataSource,
  FacilityStatus,
  Goal,
  OccurrenceStatus,
  Surface,
} from '@runsaturday/shared';
import type { $Enums, Event, EventOccurrence, EventScore } from '../../generated/prisma/client';
import type { EventRecord } from '../DataStore';

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

export function mapEvent(event: Event, score: EventScore | undefined): EventRecord {
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
    averageParticipants: score?.averageParticipants != null ? Math.round(score.averageParticipants) : null,
    source: mapSource(event.source),
    scores: score
      ? {
          pbScore: score.pbScore,
          difficultyScore: score.difficultyScore,
          competitionScore: score.competitionScore,
          gemBaseScore: score.gemBaseScore,
          pbConfidence: mapConfidence(score.pbConfidence),
          competitionConfidence: mapConfidence(score.competitionConfidence),
          sampleSize: score.sampleSize,
          windowDays: score.windowDays,
          calculationVersion: score.calculationVersion,
          calculatedAt: score.calculatedAt.toISOString(),
        }
      : null,
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
