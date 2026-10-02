import { describe, expect, it } from 'vitest';
import { addDays, calendarDateIn, formatDateWithYear, formatLongDate, formatShortDate, nextSaturday, upcomingSaturdays } from '../dates';

describe('nextSaturday', () => {
  it.each([
    ['2026-10-01', '2026-10-03'], // Thursday
    ['2026-10-02', '2026-10-03'], // Friday
    ['2026-10-03', '2026-10-03'], // Saturday itself
    ['2026-10-04', '2026-10-10'], // Sunday
    ['2026-12-28', '2027-01-02'], // across a year boundary
    ['2026-03-28', '2026-03-28'], // UK clocks change the next day
  ])('from %s is %s', (from, expected) => {
    expect(nextSaturday(from)).toBe(expected);
  });

  it('rejects invalid dates', () => {
    expect(() => nextSaturday('not-a-date')).toThrow(RangeError);
  });
});

describe('date helpers', () => {
  it('adds days', () => {
    expect(addDays('2026-10-03', -90)).toBe('2026-07-05');
  });

  it('formats labels in en-GB', () => {
    expect(formatLongDate('2026-10-03')).toBe('Saturday, 3 October');
    expect(formatShortDate('2026-10-03')).toBe('3 Oct');
    expect(formatDateWithYear('2026-03-07')).toBe('7 Mar 2026');
  });

  it('resolves the calendar date in a time zone', () => {
    // 23:30 UTC on Friday is already Saturday in London during BST.
    expect(calendarDateIn(new Date('2026-10-02T23:30:00Z'), 'Europe/London')).toBe('2026-10-03');
  });
});

describe('upcomingSaturdays', () => {
  it('lists consecutive Saturdays starting with the upcoming one', () => {
    expect(upcomingSaturdays('2026-10-01', 4)).toEqual(['2026-10-03', '2026-10-10', '2026-10-17', '2026-10-24']);
    expect(upcomingSaturdays('2026-10-03', 2)).toEqual(['2026-10-03', '2026-10-10']);
  });
});
