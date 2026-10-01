/**
 * Saturday Planner filters. Each filter only uses properties stored in the data model.
 * When a filter is active and an event's value is unknown, the event is excluded: we cannot
 * confirm it matches, and we never guess.
 */
import {
  COURSE_FILTERS,
  ELEVATION_FILTERS,
  PARTICIPANT_FILTERS,
  type EventSummary,
  type PlannerFilters,
} from '@runsaturday/shared';

const option = <T extends { id: string }>(options: readonly T[], id: string) => options.find((o) => o.id === id)!;

export function matchesFilters(e: EventSummary, f: PlannerFilters): boolean {
  if (f.surface !== 'any' && e.surface !== f.surface) return false;

  const elevation = option(ELEVATION_FILTERS, f.elevation);
  if (elevation.maxM != null && (e.elevationM == null || e.elevationM >= elevation.maxM)) return false;

  const participants = option(PARTICIPANT_FILTERS, f.participants);
  if (participants.min != null || participants.max != null) {
    const n = e.averageParticipants;
    if (n == null) return false;
    if (participants.min != null && n < participants.min) return false;
    if (participants.max != null && n >= participants.max) return false;
  }

  if (f.visited !== 'any') {
    if (e.visited == null) return false;
    if (e.visited !== (f.visited === 'visited')) return false;
  }

  const course = option(COURSE_FILTERS, f.course);
  if (course.minLaps != null) {
    if (e.laps == null) return false;
    if (e.laps < course.minLaps || (course.maxLaps != null && e.laps > course.maxLaps)) return false;
  }

  if (f.confidence !== 'any') {
    const level = e.scores?.pbConfidence ?? 'insufficient';
    const ok = f.confidence === 'high' ? level === 'high' : level === 'high' || level === 'medium';
    if (!ok) return false;
  }

  return true;
}
