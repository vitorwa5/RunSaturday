/** Event history for a chosen window, summarised from the occurrence summary cache. */
import {
  type EventHistoryResponse,
  type HistoryWindowId,
  type OccurrenceSummary,
} from '@runsaturday/shared';
import { median } from '../domain/statistics';
import { windowFrom } from '../domain/windows';

const values = (rows: OccurrenceSummary[], pick: (o: OccurrenceSummary) => number | null) =>
  rows.map(pick).filter((v): v is number => v != null);

const roundOrNull = (v: number | null) => (v == null ? null : Math.round(v));

/**
 * @param occurrences all occurrences for the event, any order
 * @param today ISO date; the window covers (today - days, today]
 */
export function buildEventHistory(
  eventId: string,
  occurrences: OccurrenceSummary[],
  window: HistoryWindowId,
  today: string,
): EventHistoryResponse {
  const from = windowFrom(window, today);
  const sorted = [...occurrences].filter((o) => o.date <= today).sort((a, b) => b.date.localeCompare(a.date));
  const inWindow = from == null ? sorted : sorted.filter((o) => o.date >= from);
  const completed = inWindow.filter((o) => o.status === 'completed');

  return {
    eventId,
    window,
    from,
    to: today,
    summary: {
      eventsHeld: completed.length,
      cancelled: inWindow.filter((o) => o.status === 'cancelled').length,
      medianParticipants: roundOrNull(median(values(completed, (o) => o.participantCount))),
      medianWinnerSeconds: roundOrNull(median(values(completed, (o) => o.winnerTimeSeconds))),
      medianThirdSeconds: roundOrNull(median(values(completed, (o) => o.thirdTimeSeconds))),
      medianFifthSeconds: roundOrNull(median(values(completed, (o) => o.fifthTimeSeconds))),
      medianTenthSeconds: roundOrNull(median(values(completed, (o) => o.tenthTimeSeconds))),
    },
    occurrences: inWindow,
    coverage: {
      firstDate: sorted.at(-1)?.date ?? null,
      lastDate: sorted[0]?.date ?? null,
      totalOccurrences: sorted.length,
    },
  };
}
