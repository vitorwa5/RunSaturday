/** One mode-aware visit boundary shared by user context, Explore and Challenges. */
import { deriveVisits, type VisitHistory } from '../challenges/visits';
import type { DataStore, PerformanceRecord } from '../repositories/DataStore';

export async function scopedVisitHistory(store: DataStore, performances: readonly PerformanceRecord[], today: string): Promise<VisitHistory> {
  const referenced = [...new Set(performances.flatMap((performance) => performance.eventId == null ? [] : [performance.eventId]))];
  const trusted = new Set(await store.listTrustedEventIds(referenced));
  return deriveVisits(performances, today, trusted);
}
