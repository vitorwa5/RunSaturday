import { describe, expect, it } from 'vitest';
import { estimateTravel, haversineKm } from '../services/travel';

describe('haversineKm', () => {
  it('is zero for the same point', () => {
    expect(haversineKm({ latitude: 53.4, longitude: -2.6 }, { latitude: 53.4, longitude: -2.6 })).toBe(0);
  });

  it('matches a known distance (Liverpool to Manchester city centres ≈ 50 km)', () => {
    const km = haversineKm({ latitude: 53.4084, longitude: -2.9916 }, { latitude: 53.4808, longitude: -2.2426 });
    expect(km).toBeGreaterThan(49);
    expect(km).toBeLessThan(51);
  });
});

describe('estimateTravel', () => {
  it('labels the method and includes a fixed overhead', () => {
    const t = estimateTravel({ latitude: 53.4, longitude: -2.6 }, { latitude: 53.4, longitude: -2.6 });
    expect(t).toEqual({ distanceKm: 0, minutes: 4, method: 'straight_line_estimate' });
  });

  it('grows with distance', () => {
    const origin = { latitude: 53.4, longitude: -2.6 };
    const near = estimateTravel(origin, { latitude: 53.45, longitude: -2.6 });
    const far = estimateTravel(origin, { latitude: 53.8, longitude: -2.6 });
    expect(far.minutes).toBeGreaterThan(near.minutes);
  });
});
