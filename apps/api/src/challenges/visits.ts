/**
 * VISITS (Phase 5A). CANONICAL SOURCE: the user's UserPerformance rows. A known (internal) event
 * is visited when the user has at least one performance there, dated on or before asOfDate.
 * External races (no eventId) are valid performances but never make a 5K Compass event visited.
 * Only identities explicitly resolved by the mode-aware catalogue boundary count as visits.
 * Recorded run totals remain canonical, including out-of-scope references.
 * Nothing here is stored: the deprecated UserEvent.visited / visitCount columns are not read.
 */
import { FIVE_K_METERS, type VisitedEvent } from '@runsaturday/shared';
import type { PerformanceRecord } from '../repositories/DataStore';

/** One visit: a performance at a known event. */
export interface Visit {
  performanceId: string;
  eventId: string;
  eventName: string;
  date: string;
}

export interface VisitHistory {
  asOfDate: string;
  /** Every visit, oldest first (date, then performance id). */
  visits: Visit[];
  /** One entry per visited event, most recently visited first (then name, id). */
  events: VisitedEvent[];
  totalRuns: number;
  externalRuns: number;
}

export function deriveVisits(performances: readonly PerformanceRecord[], asOfDate: string, trustedEventIds: ReadonlySet<string>): VisitHistory {
  const past = performances.filter((p) => p.date <= asOfDate);
  const visits: Visit[] = past
    .filter((p) => p.eventId != null && trustedEventIds.has(p.eventId))
    .map((p) => ({ performanceId: p.id, eventId: p.eventId!, eventName: p.eventName ?? p.eventId!, date: p.date }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.performanceId.localeCompare(b.performanceId));

  const byEvent = new Map<string, VisitedEvent>();
  for (const v of visits) {
    const e = byEvent.get(v.eventId);
    if (e) {
      e.visitCount += 1;
      e.latestVisit = v.date;
    } else byEvent.set(v.eventId, { eventId: v.eventId, eventName: v.eventName, visitCount: 1, firstVisit: v.date, latestVisit: v.date, pbSeconds: null });
  }
  for (const p of past) {
    if (p.eventId == null || p.distanceMeters !== FIVE_K_METERS) continue;
    const e = byEvent.get(p.eventId);
    if (!e) continue;
    e.pbSeconds = e.pbSeconds == null ? p.finishTimeSeconds : Math.min(e.pbSeconds, p.finishTimeSeconds);
  }
  const events = [...byEvent.values()].sort(
    (a, b) => b.latestVisit.localeCompare(a.latestVisit) || a.eventName.localeCompare(b.eventName) || a.eventId.localeCompare(b.eventId),
  );
  return { asOfDate, visits, events, totalRuns: past.length, externalRuns: past.filter((p) => p.eventId == null).length };
}
