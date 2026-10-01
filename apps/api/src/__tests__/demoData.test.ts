import { describe, expect, it } from 'vitest';
import { buildDemoDataset, latestCompletedSaturday } from '../demo/buildDemoDataset';
import { DEMO_EVENTS } from '../demo/demoEvents';
import { generateDemoHistory } from '../demo/generateDemoHistory';

describe('DEMO dataset', () => {
  it('has 8–12 clearly labelled fictional events with unique slugs', () => {
    expect(DEMO_EVENTS.length).toBeGreaterThanOrEqual(8);
    expect(DEMO_EVENTS.length).toBeLessThanOrEqual(12);
    expect(new Set(DEMO_EVENTS.map((e) => e.slug)).size).toBe(DEMO_EVENTS.length);
    for (const e of DEMO_EVENTS) expect(e.slug.startsWith('demo-')).toBe(true);
  });

  it('places every event in North West England', () => {
    for (const e of DEMO_EVENTS) {
      expect(e.latitude).toBeGreaterThan(52.9);
      expect(e.latitude).toBeLessThan(54.5);
      expect(e.longitude).toBeGreaterThan(-3.4);
      expect(e.longitude).toBeLessThan(-2.0);
    }
  });

  it('anchors history to the last completed Saturday', () => {
    expect(latestCompletedSaturday('2026-10-01')).toBe('2026-09-26');
    expect(latestCompletedSaturday('2026-10-03')).toBe('2026-09-26');
    expect(latestCompletedSaturday('2026-10-04')).toBe('2026-10-03');
  });

  it('generates identical history for the same date (deterministic)', () => {
    const def = DEMO_EVENTS[0]!;
    expect(generateDemoHistory(def, '2026-09-26')).toEqual(generateDemoHistory(def, '2026-09-26'));
  });

  it('keeps placing times consistent with result rows', () => {
    for (const { occurrences } of buildDemoDataset('2026-10-01').events) {
      for (const o of occurrences.filter((x) => x.status === 'COMPLETED')) {
        expect(o.results).toHaveLength(o.participantCount!);
        expect(o.results.map((r) => r.position)).toEqual(o.results.map((_, i) => i + 1));
        const times = o.results.map((r) => r.finishTimeSeconds);
        expect(times).toEqual([...times].sort((a, b) => a - b));
        expect(o.winnerTimeSeconds).toBe(times[0]);
        expect(o.tenthTimeSeconds).toBe(times[9] ?? null);
      }
    }
  });

  it('marks cancelled occurrences without results', () => {
    const estuary = buildDemoDataset('2026-10-01').events.find((e) => e.id === 'demo-estuary-path-5k')!;
    const cancelled = estuary.occurrences.filter((o) => o.status === 'CANCELLED');
    expect(cancelled).toHaveLength(1);
    expect(cancelled[0]!.results).toHaveLength(0);
    expect(estuary.sampleSize).toBe(12);
  });
});
