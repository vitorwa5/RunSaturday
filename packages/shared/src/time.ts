/**
 * Finish-time helpers. Times are always stored and transported as whole seconds;
 * strings only exist at the edges (import parsing and display).
 */

/** Upper bound for a plausible 5K finish (3 hours). Anything longer is treated as invalid input. */
export const MAX_FINISH_SECONDS = 3 * 60 * 60;
/** Lower bound for a plausible 5K finish (12 minutes; the men's world record is ~12:35). */
export const MIN_FINISH_SECONDS = 12 * 60;

/**
 * Parse "mm:ss" or "h:mm:ss" into seconds. Returns null for malformed or implausible values
 * instead of throwing, so callers can decide how to report bad data.
 */
export function parseFinishTime(input: string): number | null {
  const trimmed = input.trim();
  if (!/^\d{1,2}(:\d{2}){1,2}$/.test(trimmed)) return null;

  const parts = trimmed.split(':').map(Number);
  const [h, m, s] = parts.length === 3 ? parts : [0, ...parts];
  if (h === undefined || m === undefined || s === undefined) return null;
  if (m > 59 || s > 59) return null;

  const total = h * 3600 + m * 60 + s;
  if (total < MIN_FINISH_SECONDS || total > MAX_FINISH_SECONDS) return null;
  return total;
}

/** Format seconds as "m:ss", or "h:mm:ss" when an hour or longer. */
export function formatFinishTime(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return '—';
  const rounded = Math.round(totalSeconds);
  const h = Math.floor(rounded / 3600);
  const m = Math.floor((rounded % 3600) / 60);
  const s = rounded % 60;
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/** Format a time range such as "19:12–19:28". */
export function formatFinishTimeRange(lowSeconds: number, highSeconds: number): string {
  return `${formatFinishTime(lowSeconds)}–${formatFinishTime(highSeconds)}`;
}
