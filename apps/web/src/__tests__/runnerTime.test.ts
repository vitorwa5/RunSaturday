import type { UserProfile } from '@runsaturday/shared';
import { describe, expect, it } from 'vitest';
import { formatFrequency, formatPlacementRange } from '../lib/display';
import { MANUAL_TIME_ERROR, parseIdList, resolveRunnerTime, validateManualTime } from '../lib/runnerTime';

const profile = { current5kEstimateSeconds: 1180, recentPbSeconds: 1172, lifetimePbSeconds: 1138 } as UserProfile;

describe('runner time', () => {
  it('resolves profile sources and manual input', () => {
    expect(resolveRunnerTime('current', profile, null)).toBe(1180);
    expect(resolveRunnerTime('recent', profile, null)).toBe(1172);
    expect(resolveRunnerTime('pb', profile, null)).toBe(1138);
    expect(resolveRunnerTime('manual', profile, 1170)).toBe(1170);
    expect(resolveRunnerTime('current', undefined, null)).toBeNull();
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
