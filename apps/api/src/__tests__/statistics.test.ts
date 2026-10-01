import { describe, expect, it } from 'vitest';
import { median } from '../domain/statistics';

describe('median', () => {
  it.each([
    [[], null],
    [[5], 5],
    [[3, 1, 2], 2],
    [[4, 1, 3, 2], 2.5],
    [[1170, 1170, 1200], 1170],
  ])('median(%j) = %s', (values, expected) => {
    expect(median(values)).toBe(expected);
  });

  it('does not mutate its input', () => {
    const values = [3, 1, 2];
    median(values);
    expect(values).toEqual([3, 1, 2]);
  });
});
