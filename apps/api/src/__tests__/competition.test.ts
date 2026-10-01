import { describe, expect, it } from 'vitest';
import { cohortStrengths, computeCompetition, COMPETITION_V1, fieldDepthPosition, type CompetitionOccurrenceInput } from '../analytics/competition';

const AS_OF = '2026-10-01';
type Times = { winner: number; third: number; fifth: number; tenth: number | null; depth: number };

/** `n` identical weekly occurrences for an event. */
function weeks(eventId: string, t: Times, n = 6, overrides: Partial<CompetitionOccurrenceInput> = {}): CompetitionOccurrenceInput[] {
  return Array.from({ length: n }, (_, i) => ({
    eventId,
    date: `2026-09-${String(26 - 7 * (i % 4)).padStart(2, '0')}`.replace('-09--', '-08-'),
    status: 'completed' as const,
    dataQuality: 'valid' as const,
    participantCount: 200,
    resultCount: 200,
    winnerSeconds: t.winner,
    thirdSeconds: t.third,
    fifthSeconds: t.fifth,
    tenthSeconds: t.tenth,
    fieldDepthSeconds: t.depth,
    ...overrides,
  })).map((o, i) => ({ ...o, date: dateWeeksAgo(i) }));
}
const dateWeeksAgo = (i: number) => new Date(Date.parse('2026-09-26T00:00:00Z') - i * 7 * 86_400_000).toISOString().slice(0, 10);

const strong: Times = { winner: 960, third: 1010, fifth: 1040, tenth: 1100, depth: 1200 };
const average: Times = { winner: 1050, third: 1110, fifth: 1150, tenth: 1220, depth: 1330 };
const weak: Times = { winner: 1150, third: 1260, fifth: 1320, tenth: 1400, depth: 1500 };

const run = (occurrences: CompetitionOccurrenceInput[], ids?: string[]) => {
  const eventIds = ids ?? [...new Set(occurrences.map((o) => o.eventId))];
  return new Map(computeCompetition(eventIds, occurrences, { windowDays: 90, asOfDate: AS_OF }).map((b) => [b.eventId, b]));
};

describe('cohortStrengths (mid-rank percentile)', () => {
  it('ranks faster medians higher, shares ties, and ignores the size of gaps', () => {
    const s = cohortStrengths(new Map([['a', 900], ['b', 1000], ['c', 1000], ['d', 5000]]));
    expect(s.get('a')).toBe(100);
    expect(s.get('b')).toBe(50); // beats d, ties c: (1 + 0.5) / 3
    expect(s.get('c')).toBe(50);
    expect(s.get('d')).toBe(0);
    // An extreme value does not change anyone else's strength.
    const s2 = cohortStrengths(new Map([['a', 900], ['b', 1000], ['c', 1000], ['d', 1100]]));
    expect([...s2.values()]).toEqual([...s.values()]);
  });
});

describe('cohortStrengths tie handling (other events only, never self)', () => {
  const strengths = (values: number[]) => cohortStrengths(new Map(values.map((v, i) => [`e${i}`, v])));

  it.each([2, 3, 5, 10])('with %i events: unique strongest → 100, unique weakest → 0', (n) => {
    const values = Array.from({ length: n }, (_, i) => 1000 + i * 10); // e0 fastest … e(n-1) slowest
    const s = strengths(values);
    expect(s.get('e0')).toBe(100);
    expect(s.get(`e${n - 1}`)).toBe(0);
  });

  it.each([2, 3, 4, 10])('with %i identical values every event scores exactly 50', (n) => {
    const s = strengths(Array.from({ length: n }, () => 1234));
    expect([...s.values()]).toEqual(Array.from({ length: n }, () => 50));
  });

  it('excludes the event itself: three distinct values give 100 / 50 / 0', () => {
    // If self were counted as a tie, the fastest would be (2 + 0.5) / 2 = 125 and the slowest 25.
    const s = strengths([900, 1000, 1100]);
    expect([s.get('e0'), s.get('e1'), s.get('e2')]).toEqual([100, 50, 0]);
  });

  it('gives tied events exactly the same score wherever the tie falls', () => {
    // Tie at the top: each beats 3 others and ties 1 → (3 + 0.5) / 4 = 87.5 → 88.
    const top = strengths([900, 900, 1000, 1100, 1200]);
    expect(top.get('e0')).toBe(88);
    expect(top.get('e1')).toBe(top.get('e0'));
    // Tie in the middle: beats 2, ties 1 → (2 + 0.5) / 4 = 62.5 → 63.
    const mid = strengths([900, 1000, 1000, 1100, 1200]);
    expect(mid.get('e1')).toBe(63);
    expect(mid.get('e2')).toBe(mid.get('e1'));
    // Tie at the bottom: beats 0, ties 1 → 0.5 / 4 = 12.5 → 13.
    const bottom = strengths([900, 1000, 1100, 1200, 1200]);
    expect(bottom.get('e3')).toBe(13);
    expect(bottom.get('e4')).toBe(bottom.get('e3'));
    // A three-way tie among five: beats 1, ties 2 → (1 + 1) / 4 = 50.
    const three = strengths([900, 1000, 1000, 1000, 1200]);
    expect([three.get('e1'), three.get('e2'), three.get('e3')]).toEqual([50, 50, 50]);
  });

  it('is independent of input order', () => {
    const a = cohortStrengths(new Map([['x', 1000], ['y', 900], ['z', 1000]]));
    const b = cohortStrengths(new Map([['z', 1000], ['x', 1000], ['y', 900]]));
    expect([...a.entries()].sort()).toEqual([...b.entries()].sort());
  });

  it('end to end: a cohort of identical events scores 50 on every component and overall', () => {
    const r = computeCompetition(['a', 'b', 'c'], [...weeks('a', average), ...weeks('b', average), ...weeks('c', average)], { windowDays: 90, asOfDate: AS_OF });
    for (const b of r) {
      expect(b.value).toBe(50);
      expect(b.components.every((c) => c.value === 50)).toBe(true);
    }
  });
});

describe('Competition V1', () => {
  it('uses the documented weights', () => {
    expect(COMPETITION_V1.weights).toEqual({ winner: 0.25, third: 0.25, fifth: 0.2, tenth: 0.2, field_depth: 0.1 });
    expect(fieldDepthPosition(200)).toBe(20);
    expect(fieldDepthPosition(5)).toBe(1);
  });

  it('scores an event with faster winner-to-top-10 results above a slower one', () => {
    const r = run([...weeks('A', strong), ...weeks('B', weak), ...weeks('C', average)]);
    expect(r.get('A')!.value).toBe(100);
    expect(r.get('C')!.value).toBe(50);
    expect(r.get('B')!.value).toBe(0);
    expect(r.get('A')!.version).toBe('competition_v1');
    expect(r.get('A')!.components.map((c) => [c.key, c.value])).toEqual([
      ['winner', 100],
      ['third', 100],
      ['fifth', 100],
      ['tenth', 100],
      ['field_depth', 100],
    ]);
  });

  it('a deep field outranks a fast winner with a weak field', () => {
    const fastWinnerWeakField: Times = { winner: 900, third: 1280, fifth: 1330, tenth: 1410, depth: 1520 };
    const slowerWinnerDeepField: Times = { winner: 1000, third: 1030, fifth: 1060, tenth: 1110, depth: 1210 };
    const r = run([...weeks('fast', fastWinnerWeakField), ...weeks('deep', slowerWinnerDeepField), ...weeks('mid', average)]);
    expect(r.get('fast')!.components[0]!.value).toBe(100); // the winner is the strongest
    expect(r.get('deep')!.value!).toBeGreaterThan(r.get('fast')!.value!);
    expect(r.get('deep')!.value).toBe(88); // (25×50 + 25×100 + 20×100 + 20×100 + 10×100) / 100 = 87.5
    expect(r.get('fast')!.value).toBe(25); // winner 100 × 25%, slowest on every other component (0)
  });

  it('gives tied events equal scores and orders results deterministically', () => {
    const r = computeCompetition(['z', 'a', 'm'], [...weeks('z', average), ...weeks('a', average), ...weeks('m', strong)], { windowDays: 90, asOfDate: AS_OF });
    expect(r.map((b) => b.eventId)).toEqual(['a', 'm', 'z']);
    expect(r[0]!.value).toBe(r[2]!.value);
    expect(r[0]!.value).toBe(25);
  });

  it('re-normalises weights when one component is missing and flags it', () => {
    const smallFields = (id: string, t: Times) => weeks(id, { ...t, tenth: null }, 6, { participantCount: 9, resultCount: 9 });
    const r = run([...smallFields('A', strong), ...weeks('B', weak), ...weeks('C', average)]);
    const a = r.get('A')!;
    expect(a.components.find((c) => c.key === 'tenth')!.value).toBeNull();
    expect(a.components.find((c) => c.key === 'tenth')!.observations).toBe(0);
    expect(a.value).toBe(100); // remaining 80% of the weight, all 100
  });

  it('gives no score (Limited data) with fewer than 3 usable occurrences', () => {
    const r = run([...weeks('A', strong), ...weeks('B', weak), ...weeks('C', average), ...weeks('new', strong, 2)]);
    expect(r.get('new')!.value).toBeNull();
    expect(r.get('new')!.confidence.level).toBe('insufficient');
    expect(r.get('new')!.sampleSize).toBe(2);
    expect(r.get('A')!.cohortSize).toBe(3);
  });

  it('excludes cancelled and unvalidated or incomplete occurrences', () => {
    const occurrences = [
      ...weeks('A', strong, 4),
      { ...weeks('A', weak, 1)[0]!, date: '2026-07-11', status: 'cancelled' as const, resultCount: 0, participantCount: null },
      { ...weeks('A', weak, 1)[0]!, date: '2026-07-04', dataQuality: 'unvalidated' as const },
      { ...weeks('A', weak, 1)[0]!, date: '2026-06-27', participantCount: 250 }, // partial import
      ...weeks('B', weak),
      ...weeks('C', average),
    ];
    const a = run(occurrences).get('A')!;
    expect(a.sampleSize).toBe(4);
    expect(a.excluded).toEqual({ cancelled: 1, insufficientData: 2 });
    expect(a.value).toBe(100); // the weak, unusable dates had no effect
    expect(a.confidence.factors.find((f) => f.key === 'completeness')!.value).toBe(67); // 4 of 6 non-cancelled
  });

  it('needs a cohort of at least 3 events to compare against', () => {
    const r = run([...weeks('A', strong), ...weeks('B', weak)]);
    expect(r.get('A')!.value).toBeNull();
    expect(r.get('A')!.components.every((c) => c.value == null)).toBe(true);
    expect(r.get('A')!.components[0]!.medianSeconds).toBe(960);
  });

  it('includes events with no occurrences as Limited data', () => {
    const r = run([...weeks('A', strong), ...weeks('B', weak), ...weeks('C', average)], ['A', 'B', 'C', 'empty']);
    expect(r.get('empty')).toMatchObject({ value: null, sampleSize: 0 });
  });
});
