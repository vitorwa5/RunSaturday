/**
 * Critical regression (Phase 3B): a fast course A and a hilly course B where the same runners
 * are consistently 4–6% slower at B. A 19:35 run at A must convert to a slower equivalent at B,
 * and course-adjusted placements must differ from raw-time placements.
 */
import type { EventSummary } from '@runsaturday/shared';
import { describe, expect, it } from 'vitest';
import { computeCourseFactors, type PerformanceInput } from '../analytics/courseSpeed';
import { hashString, mulberry32 } from '../domain/random';
import type { PlacementOccurrenceInput } from '../domain/placementEngine';
import type { DataStore } from '../repositories/DataStore';
import { computeAdjustedPlacements, computePlacements } from '../services/placementService';
import { makeEvent } from './helpers';
import { AS_OF, REPLICATES, synth } from './synthRunners';

const TIME = 19 * 60 + 35;

/** Each runner is 4–6% slower at B (per-runner course response), noise on top. */
function world(): PerformanceInput[] {
  const base = synth({ truth: { A: 1, B: 1, C: 1.01 }, groups: [{ runners: 150, rotation: ['A', 'B', 'C'] }], noise: 0.01 });
  return base.map((p) => {
    if (p.eventId !== 'B') return p;
    const slowdown = 1.04 + 0.02 * mulberry32(hashString(`hill|${p.athleteKey}`))();
    return { ...p, seconds: Math.round(p.seconds * slowdown) };
  });
}

/** Minimal store answering placement queries from the synthetic results. */
function storeFor(performances: PerformanceInput[]): DataStore {
  const occurrences = new Map<string, number[]>();
  for (const p of performances) {
    const key = `${p.eventId}|${p.date}`;
    occurrences.set(key, [...(occurrences.get(key) ?? []), p.seconds]);
  }
  const store: Pick<DataStore, 'listPlacementInputs'> = {
    async listPlacementInputs(seconds, eventIds, from, to) {
      const out: PlacementOccurrenceInput[] = [];
      for (const [key, times] of occurrences) {
        const [eventId, date] = key.split('|') as [string, string];
        if ((eventIds && !eventIds.includes(eventId)) || date > to || (from != null && date < from)) continue;
        out.push({
          eventId,
          date,
          status: 'completed',
          dataQuality: 'valid',
          participantCount: times.length,
          resultCount: times.length,
          fasterCount: times.filter((t) => t < seconds).length,
          equalCount: times.filter((t) => t === seconds).length,
        });
      }
      return out;
    },
  };
  return store as DataStore;
}

describe('course-adjusted placement (fast A vs hilly B)', () => {
  const performances = world();
  const factors = new Map(computeCourseFactors(['A', 'B', 'C'], performances, { asOfDate: AS_OF, replicates: REPLICATES }).map((f) => [f.eventId, f]));
  const events: EventSummary[] = ['A', 'B'].map((id) => makeEvent({ id, name: `Course ${id}` }));
  const options = { window: 'all' as const, target: 'top10' as const, today: AS_OF };

  it('measures B as 4–6% slower than A', () => {
    const ratio = factors.get('B')!.factor! / factors.get('A')!.factor!;
    expect(ratio).toBeGreaterThan(1.04);
    expect(ratio).toBeLessThan(1.06);
    expect(['high', 'medium']).toContain(factors.get('B')!.confidence.level);
  });

  it('converts 19:35 at A to a slower equivalent at B and places it differently from raw time', async () => {
    const store = storeFor(performances);
    const raw = await computePlacements(store, events, { ...options, timeSeconds: TIME });
    const adjusted = await computeAdjustedPlacements(store, events, { ...options, source: { eventId: 'A', name: 'Course A', seconds: TIME }, factors });

    expect(adjusted.unavailable).toHaveLength(0);
    const rawB = raw.placements.find((p) => p.event.id === 'B')!;
    const adjB = adjusted.placements.find((p) => p.event.id === 'B')!;
    const adjA = adjusted.placements.find((p) => p.event.id === 'A')!;

    // Same course: unchanged.
    expect(adjA.analysedSeconds).toBe(TIME);
    expect(adjA.adjustment!.deltaSeconds).toBe(0);

    // Hilly B: equivalent is 4–6% slower than 19:35, and it is what the engine analysed.
    expect(rawB.analysedSeconds).toBe(TIME);
    expect(rawB.adjustment).toBeNull();
    expect(adjB.adjustment!.available).toBe(true);
    expect(adjB.analysedSeconds).toBe(adjB.adjustment!.equivalentSeconds);
    expect(adjB.analysedSeconds).toBeGreaterThan(TIME * 1.04);
    expect(adjB.analysedSeconds).toBeLessThan(TIME * 1.06);

    // Raw time flatters B; the adjusted placement is further down the field.
    expect(adjB.stats!.medianPlacement.low).toBeGreaterThan(rawB.stats!.medianPlacement.high);
    expect(adjB.history.map((h) => h.best)).not.toEqual(rawB.history.map((h) => h.best));
  });

  it('never places an event whose factor is not reliable', async () => {
    const weak = new Map(factors);
    weak.set('B', { ...factors.get('B')!, confidence: { ...factors.get('B')!.confidence, level: 'low' } });
    const adjusted = await computeAdjustedPlacements(storeFor(performances), events, { ...options, source: { eventId: 'A', name: 'Course A', seconds: TIME }, factors: weak });
    expect(adjusted.placements.map((p) => p.event.id)).toEqual(['A']);
    expect(adjusted.unavailable.map((u) => u.targetEventId)).toEqual(['B']);
  });
});
