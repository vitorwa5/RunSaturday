/**
 * Personal performance history (Phase 4A). UserPerformance rows are the CANONICAL record of a
 * user's actual runs; everything here is DERIVED from them on the server and never stored or
 * edited independently:
 *   lifetime PB      fastest performance (ties: the earliest, i.e. when it was first achieved)
 *   recent best      fastest performance dated within RECENT_PERFORMANCE_WINDOW_DAYS up to today
 *   latest           most recent performance
 *   event history    per-event count, PB and latest
 *   totals           performance count and distinct events
 * Current form is NOT a performance and is not derived here (Runner Form Model, Phase 4B).
 */
import type { EventPerformanceSummary, PerformanceSummary, UserPerformance } from '@runsaturday/shared';
import { RECENT_PERFORMANCE_WINDOW_DAYS } from '../config/analysis';
import { windowStart } from '../domain/confidence';
import type { DataStore, PerformanceRecord, UserEventRecord, UserRecord } from '../repositories/DataStore';

/** Only manually entered performances may be edited or deleted by the user. */
export const isEditable = (p: Pick<PerformanceRecord, 'source'>) => p.source === 'manual';

export function toPerformanceDto(p: PerformanceRecord): UserPerformance {
  return {
    id: p.id,
    eventId: p.eventId,
    eventName: p.eventName,
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

  const byEvent = new Map<string, PerformanceRecord[]>();
  for (const p of past) byEvent.set(p.eventId, [...(byEvent.get(p.eventId) ?? []), p]);
  const events: EventPerformanceSummary[] = [...byEvent.values()]
    .map((list) => ({
      eventId: list[0]!.eventId,
      eventName: list[0]!.eventName,
      count: list.length,
      pb: toPerformanceDto(fastest(list)!),
      latest: toPerformanceDto(newest(list)!),
    }))
    .sort((a, b) => b.latest.date.localeCompare(a.latest.date) || a.eventName.localeCompare(b.eventName));

  return {
    asOfDate,
    recentWindowDays,
    lifetimePb: dto(fastest(past)),
    recentBest: dto(fastest(past.filter((p) => recentFrom == null || p.date >= recentFrom))),
    latest: dto(newest(past)),
    totalPerformances: past.length,
    uniqueEvents: byEvent.size,
    events,
  };
}

/**
 * The user with every performance-derived value filled in. This is the only place those values
 * are produced; stores never hold them.
 */
export async function loadUser(store: DataStore, userId: string, today: string): Promise<UserRecord | null> {
  const user = await store.getUser(userId);
  if (!user) return null;
  const summary = summarizePerformances(await store.listUserPerformances(userId), today);
  const ref = (p: UserPerformance | null) => (p ? { id: p.eventId, name: p.eventName } : null);

  const visited = new Map(summary.events.map((e) => [e.eventId, e]));
  const eventIds = [...new Set([...visited.keys(), ...user.favouriteEventIds])];
  const events: UserEventRecord[] = eventIds.map((eventId) => ({
    eventId,
    visited: visited.has(eventId),
    favourite: user.favouriteEventIds.includes(eventId),
    visitCount: visited.get(eventId)?.count ?? 0,
    personalBestSeconds: visited.get(eventId)?.pb.finishTimeSeconds ?? null,
  }));

  return {
    ...user,
    performance: summary,
    lifetimePbSeconds: summary.lifetimePb?.finishTimeSeconds ?? null,
    recentPbSeconds: summary.recentBest?.finishTimeSeconds ?? null,
    lifetimePbEvent: ref(summary.lifetimePb),
    recentPbEvent: ref(summary.recentBest),
    events,
  };
}
