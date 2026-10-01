import { describe, expect, it } from 'vitest';
import { confidenceFromSampleSize } from '../domain/confidence';
import {
  exclusionReason,
  historicalPlacements,
  meetsTarget,
  percentThreshold,
  summarizePlacements,
  targetFrequency,
  type PlacementOccurrenceInput,
} from '../domain/placementEngine';

const occ = (date: string, fasterCount: number, fieldSize = 120, overrides: Partial<PlacementOccurrenceInput> = {}): PlacementOccurrenceInput => ({
  eventId: 'e',
  date,
  status: 'completed',
  dataQuality: 'valid',
  participantCount: fieldSize,
  resultCount: fieldSize,
  fasterCount,
  ...overrides,
});

// Specification example: runner 19:30, faster-runner counts 5, 7, 4, 10, 3, 6.
const SPEC = [
  occ('2026-09-26', 5),
  occ('2026-09-19', 7),
  occ('2026-09-12', 4),
  occ('2026-09-05', 10),
  occ('2026-08-29', 3),
  occ('2026-08-22', 6),
];

describe('historicalPlacements', () => {
  it('places the runner at fasterCount + 1 (spec example)', () => {
    expect(historicalPlacements(SPEC).placements.map((p) => p.placement)).toEqual([6, 8, 5, 11, 4, 7]);
  });

  it('orders placements most recent first regardless of input order', () => {
    const { placements } = historicalPlacements([...SPEC].reverse());
    expect(placements.map((p) => p.date)).toEqual(SPEC.map((o) => o.date));
  });

  it('excludes cancelled occurrences and counts them', () => {
    const series = historicalPlacements([...SPEC, occ('2026-08-15', 0, 0, { status: 'cancelled', participantCount: null, dataQuality: 'unvalidated' })]);
    expect(series.placements).toHaveLength(6);
    expect(series.excluded).toEqual({ cancelled: 1, insufficientData: 0 });
  });

  it('excludes occurrences without sufficient or validated result data', () => {
    const series = historicalPlacements([
      occ('2026-08-15', 0, 0), // no result rows
      occ('2026-08-08', 3, 50, { participantCount: 80 }), // partial import
      occ('2026-08-01', 3, 50, { dataQuality: 'unvalidated' }),
      occ('2026-07-25', 3, 50, { dataQuality: 'rejected' }),
      occ('2026-07-18', 3, 50, { status: 'scheduled' }),
      occ('2026-07-11', 3, 50, { participantCount: null }), // count unknown but results present: usable
    ]);
    expect(series.placements.map((p) => p.date)).toEqual(['2026-07-11']);
    expect(series.excluded).toEqual({ cancelled: 0, insufficientData: 5 });
  });

  it('treats an inconsistent faster count as unusable', () => {
    expect(exclusionReason(occ('2026-07-11', 51, 50))).toBe('insufficient_data');
  });
});

describe('summarizePlacements', () => {
  const stats = summarizePlacements(historicalPlacements(SPEC).placements)!;

  it('computes median (rounded half up), best and worst', () => {
    // Sorted 4,5,6,7,8,11 → median 6.5 → 7th.
    expect(stats.medianPlacement).toBe(7);
    expect(stats.bestPlacement).toBe(4);
    expect(stats.worstPlacement).toBe(11);
  });

  it('computes the typical range as the nearest-rank interquartile range', () => {
    expect(stats.typicalRange).toEqual({ low: 5, high: 8 });
  });

  it('computes position frequencies as counts of events', () => {
    expect(stats.frequencies.first).toEqual({ count: 0, of: 6 });
    expect(stats.frequencies.top3).toEqual({ count: 0, of: 6 });
    expect(stats.frequencies.top5).toEqual({ count: 2, of: 6 });
    expect(stats.frequencies.top10).toEqual({ count: 5, of: 6 });
  });

  it('computes percentage-of-field frequencies', () => {
    // Field 120 + runner = 121 → top 10% = 12th or better, top 25% = 30th or better.
    expect(stats.frequencies.top10Percent).toEqual({ count: 6, of: 6 });
    expect(stats.frequencies.top25Percent).toEqual({ count: 6, of: 6 });
  });

  it('handles an odd number of events and a single event', () => {
    const odd = summarizePlacements(historicalPlacements([occ('a', 1), occ('b', 9), occ('c', 4)]).placements)!;
    expect(odd.medianPlacement).toBe(5);
    const single = summarizePlacements(historicalPlacements([occ('a', 0)]).placements)!;
    expect(single).toMatchObject({ medianPlacement: 1, bestPlacement: 1, worstPlacement: 1, typicalRange: { low: 1, high: 1 } });
    expect(single.frequencies.first).toEqual({ count: 1, of: 1 });
  });

  it('returns null when there is no usable data', () => {
    expect(summarizePlacements([])).toBeNull();
  });
});

describe('percentage targets', () => {
  it('uses the field including the runner and always counts the winner', () => {
    expect(percentThreshold(99, 0.1)).toBe(10); // 100 including runner → 10th
    expect(percentThreshold(104, 0.1)).toBe(10); // 105 → 10.5 → 10th
    expect(percentThreshold(5, 0.1)).toBe(1); // tiny field: only the winner
  });

  it('applies targets to individual placements', () => {
    expect(meetsTarget({ date: 'd', placement: 10, fieldSize: 99 }, 'top10pct')).toBe(true);
    expect(meetsTarget({ date: 'd', placement: 11, fieldSize: 99 }, 'top10pct')).toBe(false);
    expect(meetsTarget({ date: 'd', placement: 3, fieldSize: 99 }, 'podium')).toBe(true);
    expect(meetsTarget({ date: 'd', placement: 4, fieldSize: 99 }, 'podium')).toBe(false);
  });

  it('reports the frequency for a chosen target', () => {
    expect(targetFrequency(historicalPlacements(SPEC).placements, 'top5')).toEqual({ count: 2, of: 6 });
  });
});

describe('confidenceFromSampleSize', () => {
  it.each([
    [0, 'insufficient'],
    [2, 'insufficient'],
    [3, 'low'],
    [6, 'medium'],
    [9, 'medium'],
    [10, 'high'],
  ] as const)('%i events → %s', (n, level) => {
    expect(confidenceFromSampleSize(n)).toBe(level);
  });
});
