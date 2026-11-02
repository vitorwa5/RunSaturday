import { parsePerformanceTime } from './time';
/** User-prepared Personal History CSV v1. No provider verification or public evidence. */
export const HISTORY_MAX_ROWS = 5000;
export const HISTORY_MAX_BYTES = 5 * 1024 * 1024;
export interface HistoryCandidate { row: number; date: string; eventName: string; time: string; position?: string; distance?: string; eventId?: string | null }
export interface HistoryEvent { id: string; name: string; active: boolean; town?: string | null; region?: string | null }
export type HistoryStatus = 'NEW' | 'UNCHANGED' | 'UPDATE' | 'CONFLICT' | 'INVALID';
export interface HistoryPreviewRow { candidate: HistoryCandidate; status: HistoryStatus; message?: string; eventId: string | null; eventLabel?: string | null; matches: HistoryEvent[] }
export interface HistoryPreview { rows: HistoryPreviewRow[]; counts: Record<HistoryStatus, number> }
export interface HistoryResult { created: number; updated: number; unchanged: number; skipped: number; invalid: number; formStatus?: 'refreshed' | 'deferred' }
export const historyName = (value: string) => value.normalize('NFKC').trim().replace(/\s+/g, ' ');
export function validateHistoryRow(row: HistoryCandidate, today: string): { name: string; seconds: number; error?: string } {
  const name = historyName(row.eventName);
  let seconds = 0;
  if (name.length < 2 || name.length > 100 || /[\u0000-\u001f\u007f]/.test(name)) return { name, seconds, error: 'Event name must contain 2–100 characters without control characters.' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(row.date) || !Number.isFinite(Date.parse(row.date + 'T00:00:00Z')) || new Date(row.date + 'T00:00:00Z').toISOString().slice(0, 10) !== row.date || row.date < '1950-01-01' || row.date > today) return { name, seconds, error: 'Use a valid YYYY-MM-DD date, from 1950 through today.' };
  const parsed = parsePerformanceTime(row.time);
  seconds = parsed ?? 0;
  if (parsed == null) return { name, seconds, error: 'Finish time must be MM:SS or H:MM:SS within the recorded 5K limits (12 minutes to under 10 hours).' };
  if (row.position && (!/^[1-9]\d*$/.test(row.position) || !Number.isSafeInteger(Number(row.position)))) return { name, seconds, error: 'Position must be a positive integer (preview only; not saved).' };
  if (row.distance && row.distance !== '5000') return { name, seconds, error: 'Only 5000 m is supported; leave distance_m blank for 5K.' };
  return { name, seconds };
}
