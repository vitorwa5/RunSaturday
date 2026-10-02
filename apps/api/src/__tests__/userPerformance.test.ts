import { describe, expect, it } from 'vitest';
import { demoUserPerformances } from '../demo/demoUserPerformances';
import { DEMO_USER_LEGACY_HISTORY } from '../demo/demoEvents';
import type { PerformanceRecord } from '../repositories/DataStore';
import { COURSE_NOT_MODELLED_MESSAGE } from '@runsaturday/shared';
import { cleanExternalEventName, performanceDuplicateKey } from '../domain/performanceKey';
import { courseAdjustmentSource, summarizePerformances } from '../services/userPerformance';

const AS_OF = '2026-10-01';
let n = 0;
const perf = (eventId: string, date: string, seconds: number, overrides: Partial<PerformanceRecord> = {}): PerformanceRecord => ({
  id: `p${++n}`,
  userId: 'u',
  eventId,
  eventName: eventId.toUpperCase(),
  externalEventName: null,
  performanceType: 'parkrun',
  distanceMeters: 5000,
  date,
  finishTimeSeconds: seconds,
  source: 'manual',
  externalResultId: null,
  verified: false,
  ...overrides,
});

describe('derived performance values', () => {
  const history = [
    perf('a', '2026-09-26', 1200),
    perf('a', '2026-09-12', 1190),
    perf('b', '2026-08-01', 1210),
    perf('a', '2026-03-07', 1150), // lifetime PB, outside the 90-day window
    perf('c', '2025-11-01', 1300),
  ];

  it('derives the lifetime PB with the event where it was run', () => {
    const s = summarizePerformances(history, AS_OF);
    expect(s.lifetimePb).toMatchObject({ eventId: 'a', eventName: 'A', date: '2026-03-07', finishTimeSeconds: 1150 });
  });

  it('derives the recent best within the configured window, keeping its source event', () => {
    const s = summarizePerformances(history, AS_OF);
    expect(s.recentWindowDays).toBe(90);
    expect(s.recentBest).toMatchObject({ eventId: 'a', date: '2026-09-12', finishTimeSeconds: 1190 });
    expect(summarizePerformances(history, AS_OF, 30).recentBest?.date).toBe('2026-09-12');
    expect(summarizePerformances(history, AS_OF, 7).recentBest?.date).toBe('2026-09-26');
  });

  it('includes the first day of the window and excludes the day before', () => {
    // 90-day window ending 2026-10-01 starts on 2026-07-04.
    expect(summarizePerformances([perf('a', '2026-07-04', 1100)], AS_OF).recentBest).not.toBeNull();
    expect(summarizePerformances([perf('a', '2026-07-03', 1100)], AS_OF).recentBest).toBeNull();
  });

  it('derives the latest performance, totals and unique events', () => {
    const s = summarizePerformances(history, AS_OF);
    expect(s.latest).toMatchObject({ date: '2026-09-26', finishTimeSeconds: 1200 });
    expect(s.totalPerformances).toBe(5);
    expect(s.uniqueEvents).toBe(3);
  });

  it('derives per-event count, PB and latest, most recently run first', () => {
    const s = summarizePerformances(history, AS_OF);
    expect(s.events.map((e) => [e.eventId, e.count, e.pb.finishTimeSeconds, e.latest.date])).toEqual([
      ['a', 3, 1150, '2026-09-26'],
      ['b', 1, 1210, '2026-08-01'],
      ['c', 1, 1300, '2025-11-01'],
    ]);
  });

  it('breaks equal times by the earliest date (when the PB was first achieved)', () => {
    const s = summarizePerformances([perf('a', '2026-09-26', 1150), perf('b', '2026-05-02', 1150)], AS_OF);
    expect(s.lifetimePb?.date).toBe('2026-05-02');
  });

  it('updates every derived value when a performance is removed', () => {
    const withoutPb = history.filter((p) => p.finishTimeSeconds !== 1150);
    expect(summarizePerformances(withoutPb, AS_OF).lifetimePb?.finishTimeSeconds).toBe(1190);
    const withoutRecent = history.filter((p) => p.date !== '2026-09-12');
    expect(summarizePerformances(withoutRecent, AS_OF).recentBest?.finishTimeSeconds).toBe(1200);
    const s = summarizePerformances(history.filter((p) => p.eventId !== 'c'), AS_OF);
    expect([s.totalPerformances, s.uniqueEvents]).toEqual([4, 2]);
  });

  it('handles no performances and ignores anything dated after today', () => {
    expect(summarizePerformances([], AS_OF)).toMatchObject({ lifetimePb: null, recentBest: null, latest: null, totalPerformances: 0, uniqueEvents: 0, events: [] });
    expect(summarizePerformances([perf('a', '2026-10-03', 900)], AS_OF).lifetimePb).toBeNull();
  });

  it('marks only manual performances as editable', () => {
    const s = summarizePerformances([perf('a', '2026-09-26', 1200), perf('b', '2026-09-19', 1300, { source: 'csv', verified: true })], AS_OF);
    expect(s.events.map((e) => [e.eventId, e.pb.editable, e.pb.source])).toEqual([
      ['a', true, 'manual'],
      ['b', false, 'csv'],
    ]);
  });
});

describe('demo user history (migrated from the legacy single values)', () => {
  const latestDate = '2026-09-26';
  const records: PerformanceRecord[] = demoUserPerformances(latestDate).map((p) => ({
    ...p,
    eventName: p.eventId,
    source: 'manual',
    externalResultId: null,
    verified: false,
  }));

  it('is deterministic with unique ids and one performance per event per date', () => {
    expect(demoUserPerformances(latestDate)).toEqual(demoUserPerformances(latestDate));
    expect(new Set(records.map((r) => r.id)).size).toBe(records.length);
    expect(new Set(records.map((r) => `${r.eventId}|${r.date}`)).size).toBe(records.length);
    expect(new Set(records.map((r) => r.date)).size).toBe(records.length); // one run per Saturday
  });

  it('reproduces the legacy visit counts, event PBs, lifetime PB and recent best', () => {
    const s = summarizePerformances(records, '2026-10-01');
    for (const legacy of DEMO_USER_LEGACY_HISTORY.events) {
      const e = s.events.find((x) => x.eventId === legacy.eventId)!;
      expect([e.count, e.pb.finishTimeSeconds]).toEqual([legacy.visitCount, legacy.personalBestSeconds]);
    }
    expect(s.lifetimePb).toMatchObject({ eventId: 'demo-riverside-5k', finishTimeSeconds: 1138 });
    expect(s.recentBest).toMatchObject({ eventId: 'demo-riverside-5k', finishTimeSeconds: 1172 });
    // The lifetime PB is older than the recent window, so the two differ.
    expect(s.lifetimePb!.date < '2026-07-04').toBe(true);
    expect([s.totalPerformances, s.uniqueEvents]).toEqual([43, 4]);
  });
});

describe('Phase 4A.1: performances beyond parkrun', () => {
  const external = (name: string, date: string, seconds: number, overrides: Partial<PerformanceRecord> = {}) =>
    perf('x', date, seconds, { eventId: null, eventName: null, externalEventName: name, performanceType: 'road_race', ...overrides });

  it('lets the overall 5K PB come from an external road race while the parkrun PB stays separate', () => {
    const s = summarizePerformances([perf('a', '2026-09-26', 1150), perf('b', '2026-05-02', 1140), external('Warrington 5K', '2026-06-14', 1125)], AS_OF);
    expect(s.lifetimePb).toMatchObject({ eventId: null, eventName: 'Warrington 5K', externalEventName: 'Warrington 5K', courseModelled: false, performanceType: 'road_race', finishTimeSeconds: 1125 });
    expect(s.parkrunPb).toMatchObject({ eventId: 'b', courseModelled: true, performanceType: 'parkrun', finishTimeSeconds: 1140 });
  });

  it('uses the same performance for both PBs when the fastest 5K is a parkrun (no invented difference)', () => {
    const s = summarizePerformances([perf('a', '2026-09-26', 1150), external('Warrington 5K', '2026-06-14', 1200)], AS_OF);
    expect(s.lifetimePb!.id).toBe(s.parkrunPb!.id);
  });

  it('keeps PBs and the recent best to 5000 m; other distances never mix in', () => {
    const s = summarizePerformances([perf('a', '2026-09-26', 1150), perf('b', '2026-09-19', 900, { distanceMeters: 4000 })], AS_OF);
    expect([s.lifetimePb?.finishTimeSeconds, s.parkrunPb?.finishTimeSeconds, s.recentBest?.finishTimeSeconds]).toEqual([1150, 1150, 1150]);
    expect(s.totalPerformances).toBe(2);
  });

  it('counts distinct places including external races (names compared case-insensitively), but event history is internal only', () => {
    const s = summarizePerformances(
      [perf('a', '2026-09-26', 1150), external('Warrington 5K', '2026-06-14', 1200), external(' warrington  5k', '2025-06-15', 1210), external('Leigh 5K', '2026-04-01', 1230)],
      AS_OF,
    );
    expect(s.uniqueEvents).toBe(3);
    expect(s.events.map((e) => e.eventId)).toEqual(['a']);
  });

  it('only treats performances at known events as course-adjustment sources', () => {
    const s = summarizePerformances([perf('a', '2026-09-26', 1150), external('Warrington 5K', '2026-06-14', 1125)], AS_OF);
    expect(courseAdjustmentSource(s.parkrunPb!)).toEqual({ eventId: 'a', name: 'A', seconds: 1150 });
    expect(courseAdjustmentSource(s.lifetimePb!)).toEqual({ unavailable: COURSE_NOT_MODELLED_MESSAGE });
    expect(COURSE_NOT_MODELLED_MESSAGE).toBe('Course adjustment unavailable — this performance was recorded at a course not currently modelled by 5K Compass.');
  });
});

describe('deterministic duplicate key', () => {
  it('keys internal performances by event, date and distance', () => {
    expect(performanceDuplicateKey({ eventId: 'demo-riverside-5k', externalEventName: null, date: '2026-09-26', distanceMeters: 5000 })).toBe('event:demo-riverside-5k|2026-09-26|5000');
  });

  it('keys external performances by normalised name, so case and spacing differences are duplicates', () => {
    const key = (name: string, date = '2026-06-14', distanceMeters = 5000) => performanceDuplicateKey({ eventId: null, externalEventName: name, date, distanceMeters });
    expect(key('Warrington 5K')).toBe('external:warrington 5k|2026-06-14|5000');
    expect(key('  warrington   5K ')).toBe(key('Warrington 5K'));
    expect(key('Warrington 5K', '2026-06-21')).not.toBe(key('Warrington 5K'));
    expect(key('Warrington 5K', '2026-06-14', 10000)).not.toBe(key('Warrington 5K'));
    expect(key('Leigh 5K')).not.toBe(key('Warrington 5K'));
    expect(cleanExternalEventName('  Warrington   5K ')).toBe('Warrington 5K');
  });

  it('requires a location', () => {
    expect(() => performanceDuplicateKey({ eventId: null, externalEventName: null, date: '2026-06-14', distanceMeters: 5000 })).toThrow();
  });
});

describe('migrated demo performances', () => {
  it('are all 5000 m parkruns at known events (43 rows, unchanged by Phase 4A.1)', () => {
    const rows = demoUserPerformances('2026-09-26');
    expect(rows).toHaveLength(43);
    expect(rows.every((r) => r.distanceMeters === 5000 && r.performanceType === 'parkrun' && r.externalEventName === null && r.eventId.startsWith('demo-'))).toBe(true);
  });
});
