import type { UserPerformance, UserProfile } from '@runsaturday/shared';
import { describe, expect, it } from 'vitest';
import { formatFrequency, formatPlacementRange } from '../lib/display';
import { currentFormSeconds, defaultRunnerTimeSource, MANUAL_TIME_ERROR, parseIdList, resolveRunnerTime, validateManualTime } from '../lib/runnerTime';

const perf = (id: string, seconds: number, performanceType: 'parkrun' | 'road_race' = 'parkrun') =>
  ({ id, eventId: performanceType === 'parkrun' ? `ev-${id}` : null, eventName: id, finishTimeSeconds: seconds, performanceType, courseModelled: performanceType === 'parkrun' }) as UserPerformance;
const formOf = (status: 'estimate' | 'indicative' | 'unavailable', formSeconds: number | null) => ({ status, formSeconds, indicativeSeconds: status === 'indicative' ? 1200 : null });
const profile = {
  currentForm: formOf('estimate', 1218),
  performance: { recentBest: perf('recent', 1172), lifetimePb: perf('overall', 1120, 'road_race'), parkrunPb: perf('parkrun', 1138) },
} as unknown as UserProfile;

describe('runner time', () => {
  it('resolves Current Form, recorded bests and manual input separately', () => {
    expect(resolveRunnerTime('current', profile, null)).toBe(1218);
    expect(resolveRunnerTime('recent', profile, null)).toBe(1172);
    expect(resolveRunnerTime('pb', profile, null)).toBe(1120);
    expect(resolveRunnerTime('parkrun', profile, null)).toBe(1138);
    expect(resolveRunnerTime('manual', profile, 1170)).toBe(1170);
    expect(resolveRunnerTime('current', undefined, null)).toBeNull();
  });

  it('never treats an indicative or unavailable form as Current Form', () => {
    const indicative = { ...profile, currentForm: formOf('indicative', null) } as unknown as UserProfile;
    expect(currentFormSeconds(indicative)).toBeNull();
    expect(resolveRunnerTime('current', indicative, null)).toBeNull();
  });

  it('defaults forward-looking tools to Current Form, else the next supported reference', () => {
    expect(defaultRunnerTimeSource(profile)).toBe('current');
    const noForm = { ...profile, currentForm: formOf('unavailable', null) } as unknown as UserProfile;
    expect(defaultRunnerTimeSource(noForm)).toBe('recent');
    const nothing = { currentForm: formOf('unavailable', null), performance: { recentBest: null, lifetimePb: null, parkrunPb: null } } as unknown as UserProfile;
    expect(defaultRunnerTimeSource(nothing)).toBe('manual');
  });

  it('validates manual times', () => {
    expect(validateManualTime('19:30')).toEqual({ seconds: 1170 });
    expect(validateManualTime('1:05:30')).toEqual({ seconds: 3930 });
    for (const bad of ['', '19', '19:60', 'abc', '4:00']) expect(validateManualTime(bad)).toEqual({ error: MANUAL_TIME_ERROR });
  });

  it('parses compare ids from the URL', () => {
    expect(parseIdList('a,b,a,,c,d,e', 4)).toEqual(['a', 'b', 'c', 'd']);
    expect(parseIdList(null, 4)).toEqual([]);
  });
});

describe('placement formatting', () => {
  it('formats ranges and historical frequencies', () => {
    expect(formatPlacementRange({ low: 5, high: 8 })).toBe('5th–8th');
    expect(formatPlacementRange({ low: 1, high: 1 })).toBe('1st');
    expect(formatFrequency({ count: 10, of: 12 })).toBe('10 of 12 events');
    expect(formatFrequency({ count: 1, of: 1 })).toBe('1 of 1 event');
  });
});

describe('profile source events', () => {
  const perf = (eventId: string | null, name: string, seconds: number): UserPerformance => ({
    id: `${name}-${seconds}`,
    eventId,
    eventName: name,
    externalEventName: eventId == null ? name : null,
    courseModelled: eventId != null,
    performanceType: eventId == null ? 'road_race' : 'parkrun',
    distanceMeters: 5000,
    date: '2026-09-12',
    finishTimeSeconds: seconds,
    source: 'manual',
    verified: false,
    editable: true,
  });
  const withPerformances = (recentBest: UserPerformance, lifetimePb: UserPerformance) =>
    ({ ...profile, performance: { recentBest, lifetimePb } }) as unknown as UserProfile;

  it('carries where recent best and Overall 5K PB were run; current form has none', async () => {
    const { profileSourceEvent, profileExternalCourse } = await import('../lib/runnerTime');
    const p = withPerformances(perf('r', 'R', 1172), perf('l', 'L', 1138));
    expect(profileSourceEvent('recent', p)).toEqual({ id: 'r', name: 'R' });
    expect(profileSourceEvent('pb', p)).toEqual({ id: 'l', name: 'L' });
    expect(profileSourceEvent('current', p)).toBeNull();
    expect(profileSourceEvent('manual', p)).toBeNull();
    expect(profileExternalCourse('pb', p)).toBeNull();
  });

  it('never offers an external race as a course-adjustment source', async () => {
    const { profileSourceEvent, profileExternalCourse } = await import('../lib/runnerTime');
    const p = withPerformances(perf('r', 'R', 1172), perf(null, 'Warrington 5K', 1120));
    expect(profileSourceEvent('pb', p)).toBeNull();
    expect(profileExternalCourse('pb', p)).toBe('Warrington 5K');
    expect(profileExternalCourse('recent', p)).toBeNull();
  });
});
