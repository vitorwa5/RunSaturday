import { describe, expect, it } from 'vitest';
import {
  exclusionReason,
  historicalPlacements,
  meetsTarget,
  percentThreshold,
  summarizePlacements,
  targetFrequency,
  type PlacementOccurrenceInput,
} from '../domain/placementEngine';

const occ = (
  date: string,
  fasterCount: number,
  fieldSize = 120,
  overrides: Partial<PlacementOccurrenceInput> = {},
): PlacementOccurrenceInput => ({
  eventId: 'e',
  date,
  status: 'completed',
  dataQuality: 'valid',
  participantCount: fieldSize,
  resultCount: fieldSize,
  fasterCount,
  equalCount: 0,
  ...overrides,
});

/** One occurrence with `faster` quicker runners and `equal` runners on exactly the target time. */
const single = (faster: number, equal: number, fieldSize = 120) =>
  historicalPlacements([occ('2026-09-26', faster, fieldSize, { equalCount: equal })]).placements[0]!;

// Specification example: runner 19:30, faster-runner counts 5, 7, 4, 10, 3, 6, no ties.
const SPEC = [
  occ('2026-09-26', 5),
  occ('2026-09-19', 7),
  occ('2026-09-12', 4),
  occ('2026-09-05', 10),
  occ('2026-08-29', 3),
  occ('2026-08-22', 6),
];

describe('historicalPlacements', () => {
  it('places the runner at fasterCount + 1 when nobody shares the time (spec example)', () => {
    const { placements } = historicalPlacements(SPEC);
    expect(placements.map((p) => p.best)).toEqual([6, 8, 5, 11, 4, 7]);
    expect(placements.map((p) => p.worst)).toEqual([6, 8, 5, 11, 4, 7]);
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

  it('treats inconsistent counts as unusable', () => {
    expect(exclusionReason(occ('2026-07-11', 51, 50))).toBe('insufficient_data');
    expect(exclusionReason(occ('2026-07-11', 45, 50, { equalCount: 6 }))).toBe('insufficient_data');
    expect(exclusionReason(occ('2026-07-11', 45, 50, { equalCount: 5 }))).toBeNull();
  });
});

describe('tied finish times', () => {
  it('no ties: best and worst placing are identical', () => {
    expect(single(4, 0)).toMatchObject({ best: 5, worst: 5 });
  });

  it('one runner on the same time: two possible placings', () => {
    expect(single(4, 1)).toMatchObject({ best: 5, worst: 6 });
  });

  it('several runners on the same time: 4 faster and 3 equal → 5th–8th', () => {
    // The hypothetical runner is not one of the 3 equal results.
    expect(single(4, 3)).toMatchObject({ best: 5, worst: 8 });
  });

  it('a tie crossing the Top 3 boundary does not count as Top 3 (conservative)', () => {
    const crossing = single(1, 2); // 2nd–4th
    expect(crossing).toMatchObject({ best: 2, worst: 4 });
    expect(meetsTarget(crossing, 'podium')).toBe(false);
    expect(meetsTarget(crossing, 'top5')).toBe(true);
    const inside = single(0, 2); // 1st–3rd: every order is on the podium
    expect(meetsTarget(inside, 'podium')).toBe(true);
  });

  it('a tie crossing the Top 5 boundary does not count as Top 5', () => {
    const crossing = single(3, 2); // 4th–6th
    expect(meetsTarget(crossing, 'top5')).toBe(false);
    expect(meetsTarget(crossing, 'top10')).toBe(true);
    expect(meetsTarget(single(3, 1), 'top5')).toBe(true); // 4th–5th
  });

  it('a tie crossing the Top 10 boundary does not count as Top 10', () => {
    const crossing = single(8, 3); // 9th–12th
    expect(crossing).toMatchObject({ best: 9, worst: 12 });
    expect(meetsTarget(crossing, 'top10')).toBe(false);
    expect(meetsTarget(single(7, 2), 'top10')).toBe(true); // 8th–10th
  });

  it('applies the same rule to percentage targets and to "1st"', () => {
    // Field 99 + runner = 100 → top 10% means 10th or better.
    expect(meetsTarget(single(8, 1, 99), 'top10pct')).toBe(true); // 9th–10th
    expect(meetsTarget(single(8, 2, 99), 'top10pct')).toBe(false); // 9th–11th
    const tiedForFirst = summarizePlacements([single(0, 1)])!;
    expect(tiedForFirst.frequencies.first).toEqual({ count: 0, of: 1 });
  });

  it('reports medians and the typical range as ranges when ties affect them', () => {
    const { placements } = historicalPlacements([
      occ('2026-09-26', 4, 120, { equalCount: 3 }), // 5–8
      occ('2026-09-19', 6), // 7
      occ('2026-09-12', 2, 120, { equalCount: 1 }), // 3–4
    ]);
    const stats = summarizePlacements(placements)!;
    // Bests 3,5,7 → median 5; worsts 4,7,8 → median 7.
    expect(stats.medianPlacement).toEqual({ low: 5, high: 7 });
    expect(stats.bestPlacement).toBe(3);
    expect(stats.worstPlacement).toBe(8);
    expect(stats.typicalRange).toEqual({ low: 3, high: 8 });
    expect(stats.frequencies.top5).toEqual({ count: 1, of: 3 }); // only 3rd–4th is safely top 5
  });
});

describe('summarizePlacements', () => {
  const stats = summarizePlacements(historicalPlacements(SPEC).placements)!;

  it('computes median (rounded half up), best and worst; exact without ties', () => {
    // Sorted 4,5,6,7,8,11 → median 6.5 → 7th.
    expect(stats.medianPlacement).toEqual({ low: 7, high: 7 });
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
    expect(odd.medianPlacement).toEqual({ low: 5, high: 5 });
    const one = summarizePlacements(historicalPlacements([occ('a', 0)]).placements)!;
    expect(one).toMatchObject({ medianPlacement: { low: 1, high: 1 }, bestPlacement: 1, worstPlacement: 1, typicalRange: { low: 1, high: 1 } });
    expect(one.frequencies.first).toEqual({ count: 1, of: 1 });
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
    expect(meetsTarget({ date: 'd', best: 10, worst: 10, fieldSize: 99 }, 'top10pct')).toBe(true);
    expect(meetsTarget({ date: 'd', best: 11, worst: 11, fieldSize: 99 }, 'top10pct')).toBe(false);
    expect(meetsTarget({ date: 'd', best: 3, worst: 3, fieldSize: 99 }, 'podium')).toBe(true);
    expect(meetsTarget({ date: 'd', best: 4, worst: 4, fieldSize: 99 }, 'podium')).toBe(false);
  });

  it('reports the frequency for a chosen target', () => {
    expect(targetFrequency(historicalPlacements(SPEC).placements, 'top5')).toEqual({ count: 2, of: 6 });
  });
});
