import { describe, expect, it } from 'vitest';
import { ordinal, PLACEMENT_TARGETS } from '../tools';

describe('ordinal', () => {
  it.each([
    [1, '1st'],
    [2, '2nd'],
    [3, '3rd'],
    [4, '4th'],
    [11, '11th'],
    [12, '12th'],
    [13, '13th'],
    [21, '21st'],
    [22, '22nd'],
    [101, '101st'],
    [111, '111th'],
  ])('%i → %s', (n, expected) => {
    expect(ordinal(n)).toBe(expected);
  });
});

describe('placement targets', () => {
  it('offers podium, top 5/10 and percentage targets', () => {
    expect(PLACEMENT_TARGETS.map((t) => t.label)).toEqual(['Podium', 'Top 5', 'Top 10', 'Top 10%', 'Top 25%']);
  });
});
