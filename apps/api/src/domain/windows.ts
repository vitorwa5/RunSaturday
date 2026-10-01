import { addDays, HISTORY_WINDOWS, type HistoryWindowId } from '@runsaturday/shared';

/** First date of a window ending today: the window covers (today - days, today]. Null = all history. */
export function windowFrom(window: HistoryWindowId, today: string): string | null {
  const days = HISTORY_WINDOWS.find((w) => w.id === window)!.days;
  return days == null ? null : addDays(today, -days + 1);
}
