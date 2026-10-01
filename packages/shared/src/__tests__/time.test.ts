import { describe, expect, it } from 'vitest';
import { formatFinishTime, formatFinishTimeRange, parseFinishTime } from '../time';

describe('parseFinishTime', () => {
  it.each([
    ['19:30', 1170],
    ['19:12', 1152],
    ['0:19:30', 1170],
    ['1:02:03', 3723],
    [' 25:00 ', 1500],
  ])('parses %s as %i seconds', (input, expected) => {
    expect(parseFinishTime(input)).toBe(expected);
  });

  it.each(['', 'abc', '19', '19:7', '19:60', '19:30:00:00', '-19:30', '19.30', '5:00', '4:00:00'])(
    'rejects malformed or implausible value %j',
    (input) => {
      expect(parseFinishTime(input)).toBeNull();
    },
  );
});

describe('formatFinishTime', () => {
  it('formats minutes and seconds with padding', () => {
    expect(formatFinishTime(1170)).toBe('19:30');
    expect(formatFinishTime(1145)).toBe('19:05');
  });

  it('formats times of an hour or more', () => {
    expect(formatFinishTime(3723)).toBe('1:02:03');
  });

  it('rounds fractional seconds', () => {
    expect(formatFinishTime(1169.6)).toBe('19:30');
  });

  it('returns a dash for invalid input', () => {
    expect(formatFinishTime(Number.NaN)).toBe('—');
    expect(formatFinishTime(-1)).toBe('—');
  });

  it('round-trips with parseFinishTime', () => {
    for (const t of ['17:45', '19:30', '32:01', '1:05:00']) {
      expect(formatFinishTime(parseFinishTime(t)!)).toBe(t);
    }
  });

  it('formats a range', () => {
    expect(formatFinishTimeRange(1152, 1168)).toBe('19:12–19:28');
  });
});
