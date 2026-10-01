/**
 * Travel estimates. Phase 1 uses straight-line distance with a road factor and an
 * assumed average speed; it is always labelled as an estimate. A routing provider can
 * replace this later behind the same function signature.
 */
import type { TravelEstimate } from '@runsaturday/shared';

export interface Coordinates {
  latitude: number;
  longitude: number;
}

/** Tunable assumptions, kept here rather than in UI code. */
export const TRAVEL_ASSUMPTIONS = {
  /** Roads are longer than the crow flies. */
  roadFactor: 1.3,
  averageSpeedKmh: 50,
  /** Fixed allowance for parking and walking to the start. */
  overheadMinutes: 4,
} as const;

const EARTH_RADIUS_KM = 6371;
const toRad = (deg: number) => (deg * Math.PI) / 180;

/** Great-circle distance in kilometres. */
export function haversineKm(a: Coordinates, b: Coordinates): number {
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

export function estimateTravel(origin: Coordinates, destination: Coordinates): TravelEstimate {
  const distanceKm = haversineKm(origin, destination);
  const { roadFactor, averageSpeedKmh, overheadMinutes } = TRAVEL_ASSUMPTIONS;
  const minutes = Math.round(((distanceKm * roadFactor) / averageSpeedKmh) * 60 + overheadMinutes);
  return { distanceKm: Math.round(distanceKm * 10) / 10, minutes, method: 'straight_line_estimate' };
}
