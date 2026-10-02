import { describe, expect, it } from 'vitest';
import { buildDemoDataset, latestCompletedSaturday } from '../demo/buildDemoDataset';
import { DEMO_EVENTS } from '../demo/demoEvents';
import { generateDemoHistories, simulationCourseEffect } from '../demo/generateDemoHistory';

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
    expect(generateDemoHistories(DEMO_EVENTS, '2026-09-26')).toEqual(generateDemoHistories(DEMO_EVENTS, '2026-09-26'));
  });

  it('gives results pseudonymous demo athlete keys shared across events', () => {
    const dataset = buildDemoDataset('2026-10-01');
    const eventsByAthlete = new Map<string, Set<string>>();
    for (const { id, occurrences } of dataset.events) {
      for (const o of occurrences) {
        for (const r of o.results) {
          expect(r.athleteKey).toMatch(/^demo-athlete-\d{5}$/);
          eventsByAthlete.set(r.athleteKey, (eventsByAthlete.get(r.athleteKey) ?? new Set()).add(id));
        }
      }
    }
    const multi = [...eventsByAthlete.values()].filter((s) => s.size >= 2).length;
    // Most runners stay local, but a substantial minority visit other events.
    expect(multi / eventsByAthlete.size).toBeGreaterThan(0.2);
    expect(multi / eventsByAthlete.size).toBeLessThan(0.6);
  });

  it('never clamps winners to a fixed floor', () => {
    const winners = buildDemoDataset('2026-10-01').events.flatMap((e) => e.occurrences.flatMap((o) => (o.winnerTimeSeconds != null ? [o.winnerTimeSeconds] : [])));
    expect(winners.filter((w) => w === 900).length).toBe(0);
    expect(Math.min(...winners)).toBeGreaterThanOrEqual(13 * 60);
  });

  it('runs each athlete at most once per event day', () => {
    for (const { occurrences } of buildDemoDataset('2026-10-01').events) {
      for (const o of occurrences) expect(new Set(o.results.map((r) => r.athleteKey)).size).toBe(o.results.length);
    }
  });

  it('derives the hidden simulation course effect from course facts (never read by analytics)', () => {
    for (const def of DEMO_EVENTS) {
      const effect = simulationCourseEffect(def);
      expect(effect).toBeGreaterThan(0.95);
      expect(effect).toBeLessThan(1.2);
    }
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
