import type { EventSummary } from '@runsaturday/shared';
import { buildApp } from '../app';
import { loadConfig } from '../config/env';
import type { DataStore } from '../repositories/DataStore';
import { MemoryDataStore } from '../repositories/memory/MemoryDataStore';

/** Thursday 1 October 2026, 10:00 UK time. */
export const FIXED_NOW = new Date('2026-10-01T09:00:00Z');

export const testConfig = () => loadConfig({ DATA_SOURCE: 'demo', LOG_LEVEL: 'silent' });

export async function buildTestApp(store: DataStore = new MemoryDataStore('2026-10-01')) {
  return buildApp({ config: testConfig(), store, now: () => FIXED_NOW, logger: false });
}

/** Minimal EventSummary fixture for pure service tests. */
export function makeEvent(overrides: Partial<EventSummary> & { id: string }): EventSummary {
  return {
    slug: overrides.id,
    name: overrides.id,
    town: null,
    region: null,
    country: 'England',
    latitude: 53.4,
    longitude: -2.6,
    surface: 'tarmac',
    courseType: 'one_lap',
    laps: 1,
    elevationM: 20,
    averageParticipants: 200,
    source: 'demo',
    scores: {
      pbScore: 70,
      difficultyScore: 3,
      competitionScore: 60,
      gemBaseScore: 50,
      pbConfidence: 'high',
      competitionConfidence: 'high',
      sampleSize: 12,
      windowDays: 90,
      asOfDate: '2026-09-26',
      calculationVersion: 'test_v0',
      calculatedAt: '2026-10-01T00:00:00Z',
    },
    travel: { distanceKm: 10, minutes: 20, method: 'straight_line_estimate' },
    visited: false,
    favourite: false,
    ...overrides,
  };
}
