import { describe, expect, it } from 'vitest';
import { coarseCoordinate } from '../startingArea';
describe('coarse starting area', () => {
  it('rounds precise positive/negative values and preserves range boundaries and idempotency', () => {
    expect(coarseCoordinate(53.41234567)).toBe(53.4);
    expect(coarseCoordinate(-2.61234567)).toBe(-2.6);
    for (const value of [-180, -90, 0, 90, 180, 53.4, -2.6]) expect(coarseCoordinate(value)).toBe(value);
  });
});
