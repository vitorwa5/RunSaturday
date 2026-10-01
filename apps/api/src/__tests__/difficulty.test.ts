import { describe, expect, it } from 'vitest';
import { computeDifficulty, DIFFICULTY_V1, type CourseFacts } from '../analytics/difficulty';

const base: CourseFacts = { eventId: 'e', elevationM: 20, surface: 'tarmac', courseType: 'two_laps', laps: 2 };
const rate = (overrides: Partial<CourseFacts>) => computeDifficulty({ ...base, ...overrides }, '2026-10-01');

describe('Course Difficulty V1', () => {
  it('uses the documented weights and explicit mappings', () => {
    expect(DIFFICULTY_V1.weights).toEqual({ elevation: 0.55, surface: 0.25, structure: 0.2 });
    expect(DIFFICULTY_V1.SURFACE_SEVERITY.tarmac).toBeLessThan(DIFFICULTY_V1.SURFACE_SEVERITY.mixed);
    expect(DIFFICULTY_V1.SURFACE_SEVERITY.mixed).toBeLessThan(DIFFICULTY_V1.SURFACE_SEVERITY.grass);
  });

  it('computes a known example with a full breakdown', () => {
    const d = rate({});
    // elevation 20/150 = 13 → 7.15; surface 0; structure 45 × 0.2 = 9 → severity 16.15 → 1 + 9 × 0.1615 = 2.45
    expect(d.value).toBe(2.5);
    expect(d.version).toBe('difficulty_v1');
    expect(d.components.map((c) => [c.key, c.value, c.input])).toEqual([
      ['elevation', 13, '20 m'],
      ['surface', 0, 'Tarmac'],
      ['structure', 45, '2 laps'],
    ]);
    expect(d.confidence.level).toBe('high');
  });

  it('same course with more elevation is harder', () => {
    expect(rate({ elevationM: 90 }).value!).toBeGreaterThan(rate({ elevationM: 20 }).value!);
  });

  it('same elevation with a more demanding surface is harder', () => {
    expect(rate({ surface: 'grass' }).value!).toBeGreaterThan(rate({ surface: 'mixed' }).value!);
    expect(rate({ surface: 'mixed' }).value!).toBeGreaterThan(rate({ surface: 'tarmac' }).value!);
  });

  it('missing surface: rated from the known parts, flagged, lower confidence — never assumed easy', () => {
    const d = rate({ surface: 'unknown' });
    const surface = d.components.find((c) => c.key === 'surface')!;
    expect(surface).toMatchObject({ value: null, missing: true, input: 'Unknown' });
    expect(d.confidence.level).toBe('medium');
    expect(d.confidence.score).toBe(75);
    // Re-normalised over elevation + structure, not filled with the easiest surface (0).
    expect(d.value).toBe(2.9); // (7.15 + 9) / 0.75 = 21.5 → 1 + 9 × 0.215 = 2.94
    expect(d.value!).toBeGreaterThan(rate({ surface: 'tarmac' }).value!);
  });

  it('missing elevation: still rated from surface and structure, but low confidence', () => {
    const d = rate({ elevationM: null, surface: 'grass' });
    expect(d.components[0]).toMatchObject({ key: 'elevation', missing: true });
    expect(d.confidence.level).toBe('low');
    expect(d.value).not.toBeNull();
  });

  it('too little known: no rating', () => {
    const d = rate({ elevationM: null, surface: 'unknown' });
    expect(d.value).toBeNull();
    expect(d.confidence.level).toBe('insufficient');
  });

  it('falls back to the lap count when the course type is unknown', () => {
    expect(rate({ courseType: 'unknown', laps: 3 }).components[2]).toMatchObject({ value: 70, input: '3 laps', missing: false });
    expect(rate({ courseType: 'unknown', laps: null }).components[2]!.missing).toBe(true);
  });

  it('caps extreme elevation and always stays within 1–10', () => {
    expect(rate({ elevationM: 1500, surface: 'trail', courseType: 'three_plus_laps' }).value).toBe(8.8); // 55 + 17.5 + 14 = 86.5 → 8.785
    expect(rate({ elevationM: 1500 }).components[0]!.value).toBe(100);
    for (const elevationM of [0, 5, 50, 150, 400, 5000]) {
      for (const surface of ['tarmac', 'mixed', 'grass', 'trail', 'unknown'] as const) {
        for (const courseType of ['one_lap', 'two_laps', 'three_plus_laps', 'out_and_back', 'point_to_point', 'unknown'] as const) {
          const v = rate({ elevationM, surface, courseType }).value;
          if (v != null) {
            expect(v).toBeGreaterThanOrEqual(1);
            expect(v).toBeLessThanOrEqual(10);
          }
        }
      }
    }
    expect(rate({ elevationM: 0, surface: 'tarmac', courseType: 'point_to_point' }).value).toBe(1);
  });

  it('does not use finishing times or competition', () => {
    expect(Object.keys(base)).toEqual(['eventId', 'elevationM', 'surface', 'courseType', 'laps']);
  });
});
