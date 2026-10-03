/**
 * Personal performance history (Phase 4A/4A.1). UserPerformance rows are the CANONICAL record
 * of a user's actual runs; everything here is DERIVED from them on the server and never stored
 * or edited independently:
 *   overall 5K PB    fastest 5000 m performance of any type, parkrun or another race
 *                    (ties: the earliest, i.e. when it was first achieved)
 *   parkrun PB       fastest 5000 m performance of type parkrun (may be the same performance)
 *   recent best      fastest 5000 m performance within RECENT_PERFORMANCE_WINDOW_DAYS up to today
 *   latest           most recent performance
 *   event history    per INTERNAL event: count, PB and latest
 *   totals           performance count; distinct places (internal events + external names)
 * A performance at an external course (externalEventName, no eventId) is a valid personal
 * performance and counts towards the 5K PB, but is never a course-adjustment source.
 * Current Form is NOT a performance: it is modelled separately (services/runnerForm.ts, Phase 4B).
 */
import { COURSE_NOT_MODELLED_MESSAGE, FIVE_K_METERS, type EventPerformanceSummary, type PerformanceSummary, type UserPerformance } from '@runsaturday/shared';
import { cleanExternalEventName } from '../domain/performanceKey';
import { RECENT_PERFORMANCE_WINDOW_DAYS } from '../config/analysis';
import { windowStart } from '../domain/confidence';
import type { DataStore, PerformanceRecord, UserEventRecord, UserRecord } from '../repositories/DataStore';
import { scopedVisitHistory } from './personalVisits';
import { currentRunnerForm, formReferenceOf } from './runnerForm';

/** Only manually entered performances may be edited or deleted by the user. */
export const isEditable = (p: Pick<PerformanceRecord, 'source'>) => p.source === 'manual';

export function toPerformanceDto(p: PerformanceRecord): UserPerformance {
  return {
    id: p.id,
    eventId: p.eventId,
    eventName: p.eventName ?? p.externalEventName ?? 'Unknown event',
    externalEventName: p.externalEventName,
    courseModelled: p.eventId != null,
    performanceType: p.performanceType,
    distanceMeters: p.distanceMeters,
    date: p.date,
    finishTimeSeconds: p.finishTimeSeconds,
    source: p.source,
    verified: p.verified,
    editable: isEditable(p),
  };
}

/** Fastest first; equal times → the earlier date (first achieved), then id for determinism. */
const byFastest = (a: PerformanceRecord, b: PerformanceRecord) =>
  a.finishTimeSeconds - b.finishTimeSeconds || a.date.localeCompare(b.date) || a.id.localeCompare(b.id);
/** Newest first; same date → id. */
export const byNewest = (a: PerformanceRecord, b: PerformanceRecord) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id);

export function summarizePerformances(
  performances: readonly PerformanceRecord[],
  asOfDate: string,
  recentWindowDays: number = RECENT_PERFORMANCE_WINDOW_DAYS,
): PerformanceSummary {
  // Anything dated after asOfDate (should not exist; input validation forbids it) is ignored.
  const past = performances.filter((p) => p.date <= asOfDate);
  const recentFrom = windowStart(asOfDate, recentWindowDays);
  const fastest = (list: PerformanceRecord[]) => [...list].sort(byFastest)[0] ?? null;
  const newest = (list: PerformanceRecord[]) => [...list].sort(byNewest)[0] ?? null;
  const dto = (p: PerformanceRecord | null) => (p ? toPerformanceDto(p) : null);

  // PBs and the recent best are 5K-only; other distances (not yet offered) never mix in.
  const fiveK = past.filter((p) => p.distanceMeters === FIVE_K_METERS);

  const byEvent = new Map<string, PerformanceRecord[]>();
  for (const p of past) if (p.eventId != null) byEvent.set(p.eventId, [...(byEvent.get(p.eventId) ?? []), p]);
  const places = new Set(past.map((p) => (p.eventId != null ? `event:${p.eventId}` : `external:${cleanExternalEventName(p.externalEventName ?? '').toLowerCase()}`)));
  const events: EventPerformanceSummary[] = [...byEvent.values()]
    .map((list) => ({
      eventId: list[0]!.eventId!,
      eventName: list[0]!.eventName ?? list[0]!.eventId!,
      count: list.length,
      pb: toPerformanceDto(fastest(list)!),
      latest: toPerformanceDto(newest(list)!),
    }))
    .sort((a, b) => b.latest.date.localeCompare(a.latest.date) || a.eventName.localeCompare(b.eventName));

  return {
    asOfDate,
    recentWindowDays,
    lifetimePb: dto(fastest(fiveK)),
    parkrunPb: dto(fastest(fiveK.filter((p) => p.performanceType === 'parkrun'))),
    recentBest: dto(fastest(fiveK.filter((p) => recentFrom == null || p.date >= recentFrom))),
    latest: dto(newest(past)),
    totalPerformances: past.length,
    uniqueEvents: places.size,
    events,
  };
}

/**
 * Whether a performance can be the source of a course-adjusted comparison: only when it was run
 * at a known internal event. (Whether that event's Course Speed Factor is reliable is decided
 * later, by the course-adjustment service.) An external course is never adjustable.
 */
export function courseAdjustmentSource(p: UserPerformance): { eventId: string; name: string; seconds: number } | { unavailable: string } {
  if (p.eventId == null) return { unavailable: COURSE_NOT_MODELLED_MESSAGE };
  return { eventId: p.eventId, name: p.eventName, seconds: p.finishTimeSeconds };
}

/**
 * The user with every performance-derived value filled in. This is the only place those values
 * are produced; stores never hold them.
 */
export async function loadUser(store: DataStore, userId: string, today: string): Promise<UserRecord | null> {
  const user = await store.getUser(userId);
  if (!user) return null;
  const performances = await store.listUserPerformances(userId);
  const summary = summarizePerformances(performances, today);
  const history = await scopedVisitHistory(store, performances, today);
  // A source event only for performances at known events: external courses get none.
  const ref = (p: UserPerformance | null) => {
    const source = p ? courseAdjustmentSource(p) : null;
    return source && 'eventId' in source ? { id: source.eventId, name: source.name } : null;
  };

  const visited = new Map(history.events.map((e) => [e.eventId, e]));
  const eventIds = [...new Set([...visited.keys(), ...user.favouriteEventIds])];
  const events: UserEventRecord[] = eventIds.map((eventId) => ({
    eventId,
    visited: visited.has(eventId),
    favourite: user.favouriteEventIds.includes(eventId),
    visitCount: visited.get(eventId)?.visitCount ?? 0,
    personalBestSeconds: visited.get(eventId)?.pbSeconds ?? null,
  }));

  const currentForm = await currentRunnerForm(store, userId, today);
  return {
    ...user,
    performance: summary,
    currentForm,
    current5kEstimateSeconds: formReferenceOf(currentForm)?.formSeconds ?? null,
    lifetimePbSeconds: summary.lifetimePb?.finishTimeSeconds ?? null,
    recentPbSeconds: summary.recentBest?.finishTimeSeconds ?? null,
    lifetimePbEvent: ref(summary.lifetimePb),
    recentPbEvent: ref(summary.recentBest),
    events,
  };
}
