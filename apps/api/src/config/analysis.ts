/** Server-side analysis defaults. Kept out of UI code so they can change in one place. */

/** Analysis windows (days) that score snapshots are calculated for. 0 is reserved for all-time. */
export const SCORE_WINDOWS_DAYS = [30, 60, 90, 365] as const;

/** Window served to clients by default. */
export const DEFAULT_SCORE_WINDOW_DAYS = 90;
