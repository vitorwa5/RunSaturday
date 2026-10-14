import { createHash } from 'node:crypto';
import { historyName, validateHistoryRow, type HistoryCandidate, type HistoryEvent, type HistoryPreview, type HistoryPreviewRow, type HistoryResult } from '@runsaturday/shared';
import type { PerformanceRecord, NewPerformance } from '../repositories/DataStore';
import { performanceDuplicateKey } from '../domain/performanceKey';
export interface CsvWrite { id?: string; input: NewPerformance; externalResultId: string }
export const historyIdentity = (r: HistoryCandidate) => 'csv-v1:' + createHash('sha256').update(JSON.stringify([r.date, historyName(r.eventName).toLowerCase(), 5000])).digest('hex');
export function planHistory(rows: HistoryCandidate[], existing: PerformanceRecord[], events: HistoryEvent[], today: string): { preview: HistoryPreview; writes: CsvWrite[]; result: HistoryResult } {
  const eventNames = new Map<string, HistoryEvent[]>();
  const eventIds = new Map(events.map(e => [e.id, e]));
  for (const event of events) { const key = historyName(event.name).toLowerCase(); eventNames.set(key, [...(eventNames.get(key) ?? []), event]); }
  const csvIds = new Map(existing.filter(p => p.source === 'csv' && p.externalResultId).map(p => [p.externalResultId!, p]));
  const destinations = new Map<string, PerformanceRecord[]>();
  const participations = new Map<string, PerformanceRecord[]>();
  const participationKey = (date: string, name: string) => JSON.stringify([date, historyName(name).toLowerCase(), 5000]);
  for (const record of existing) {
    const key = performanceDuplicateKey(record); destinations.set(key, [...(destinations.get(key) ?? []), record]);
    if (record.distanceMeters === 5000) { const logical = participationKey(record.date, record.externalEventName ?? record.eventName ?? ''); participations.set(logical, [...(participations.get(logical) ?? []), record]); }
  }
  const identities = rows.map(historyIdentity);
  const frequencies = new Map<string, number>();
  identities.forEach(id => frequencies.set(id, (frequencies.get(id) ?? 0) + 1));
  const counts: HistoryPreview['counts'] = { NEW: 0, UPDATE: 0, UNCHANGED: 0, CONFLICT: 0, INVALID: 0 };
  const writes: CsvWrite[] = [];
  const usedKeys = new Set<string>();
  const preview = rows.map<HistoryPreviewRow>((candidate, index) => {
    const valid = validateHistoryRow(candidate, today);
    const matches = eventNames.get(valid.name.toLowerCase()) ?? [];
    const own = csvIds.get(identities[index]!);
    // Replay preserves the user's saved mapping, including an explicit external choice.
    const chosen = candidate.eventId === undefined ? (own ? own.eventId : matches.length === 1 ? matches[0]!.id : null) : candidate.eventId;
    const selected = chosen ? eventIds.get(chosen) : null;
    const base = { candidate, eventId: chosen, eventLabel: selected?.name ?? null, matches };
    const reject = (status: 'INVALID' | 'CONFLICT', message: string) => { counts[status]++; return { ...base, status, message }; };
    if (valid.error) return reject('INVALID', valid.error);
    if (chosen && !selected) return reject('INVALID', 'Mapping must reference a trusted catalogue event.');
    if (frequencies.get(identities[index]!)! > 1) return reject('CONFLICT', 'Repeated logical participation in this file; keep only one row.');
    const input: NewPerformance = { eventId: chosen, externalEventName: chosen ? null : valid.name, date: candidate.date, distanceMeters: 5000, finishTimeSeconds: valid.seconds, performanceType: 'other_race', source: 'csv' };
    const key = performanceDuplicateKey(input);
    const collision = [...(destinations.get(key) ?? []), ...(participations.get(participationKey(candidate.date, valid.name)) ?? [])].find(p => p.id !== own?.id);
    if (collision || usedKeys.has(key)) return reject('CONFLICT', 'This participation already exists under another record/source or mapping. It will be skipped.');
    usedKeys.add(key);
    const status = !own ? 'NEW' : own.eventId === input.eventId && own.externalEventName === input.externalEventName && own.finishTimeSeconds === input.finishTimeSeconds && own.performanceType === input.performanceType ? 'UNCHANGED' : 'UPDATE';
    counts[status]++;
    if (status !== 'UNCHANGED') writes.push({ ...(own ? { id: own.id } : {}), input, externalResultId: identities[index]! });
    return { ...base, status, ...(!own && matches.length > 1 && candidate.eventId === undefined ? { message: 'Ambiguous name: kept external unless you choose an event.' } : {}) };
  });
  return { preview: { rows: preview, counts }, writes, result: { created: counts.NEW, updated: counts.UPDATE, unchanged: counts.UNCHANGED, skipped: counts.CONFLICT, invalid: counts.INVALID } };
}
