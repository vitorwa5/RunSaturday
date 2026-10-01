import type { OccurrenceSummary } from '@runsaturday/shared';
import { describe, expect, it } from 'vitest';
import { buildEventHistory } from '../services/eventHistory';

const occ = (date: string, winner: number | null, n: number | null, status: OccurrenceSummary['status'] = 'completed'): OccurrenceSummary => ({
  date,
  status,
  participantCount: n,
  winnerTimeSeconds: winner,
  thirdTimeSeconds: winner == null ? null : winner + 60,
  fifthTimeSeconds: winner == null ? null : winner + 90,
  tenthTimeSeconds: winner == null ? null : winner + 150,
});

// Fixed dataset: five Saturdays, one cancelled.
const OCCURRENCES = [
  occ('2026-09-26', 1000, 200),
  occ('2026-09-19', 1020, 220),
  occ('2026-09-12', null, null, 'cancelled'),
  occ('2026-09-05', 990, 180),
  occ('2026-06-27', 1100, 300),
];

describe('buildEventHistory', () => {
  it('summarises the 30-day window with medians over completed events only', () => {
    const h = buildEventHistory('e', OCCURRENCES, '30', '2026-10-01');
    expect(h.from).toBe('2026-09-02');
    expect(h.occurrences.map((o) => o.date)).toEqual(['2026-09-26', '2026-09-19', '2026-09-12', '2026-09-05']);
    expect(h.summary).toEqual({
      eventsHeld: 3,
      cancelled: 1,
      medianParticipants: 200,
      medianWinnerSeconds: 1000,
      medianThirdSeconds: 1060,
      medianFifthSeconds: 1090,
      medianTenthSeconds: 1150,
    });
  });

  it('includes everything for "all" and reports coverage', () => {
    const h = buildEventHistory('e', OCCURRENCES, 'all', '2026-10-01');
    expect(h.from).toBeNull();
    expect(h.summary.eventsHeld).toBe(4);
    expect(h.summary.medianWinnerSeconds).toBe(1010); // (1000 + 1020) / 2
    expect(h.coverage).toEqual({ firstDate: '2026-06-27', lastDate: '2026-09-26', totalOccurrences: 5 });
  });

  it('returns null medians for an empty window instead of inventing values', () => {
    const h = buildEventHistory('e', [], '90', '2026-10-01');
    expect(h.summary).toMatchObject({ eventsHeld: 0, medianWinnerSeconds: null, medianParticipants: null });
    expect(h.coverage.firstDate).toBeNull();
  });

  it('ignores future-dated occurrences', () => {
    const h = buildEventHistory('e', [occ('2026-10-03', 1000, 100)], 'all', '2026-10-01');
    expect(h.occurrences).toEqual([]);
  });
});
