/** Synthetic matched-runner data for Course Speed tests (fictional, not demo or real data). */
import { addDays } from '@runsaturday/shared';
import type { PerformanceInput } from '../analytics/courseSpeed';
import { hashString, mulberry32 } from '../domain/random';

export const AS_OF = '2026-09-26';
export const REPLICATES = 40;

export function normal(rand: () => number) {
  return Math.sqrt(-2 * Math.log(Math.max(rand(), Number.EPSILON))) * Math.cos(2 * Math.PI * rand());
}

/**
 * Synthetic matched-runner data: each runner alternates between the events in `rotation`
 * week by week (a hidden true factor per event), with log-normal day noise.
 */
export function synth(options: {
  truth: Record<string, number>;
  groups: { runners: number; rotation: string[]; prefix?: string }[];
  weeks?: number;
  noise?: number;
  seed?: string;
}): PerformanceInput[] {
  const { truth, weeks = 20, noise = 0.015, seed = 'synth' } = options;
  const out: PerformanceInput[] = [];
  options.groups.forEach((g, gi) => {
    for (let r = 0; r < g.runners; r++) {
      const key = `${g.prefix ?? `g${gi}`}-${String(r).padStart(4, '0')}`;
      const rand = mulberry32(hashString(`${seed}|${key}`));
      const ability = 1200 * Math.exp(0.12 * normal(rand));
      for (let w = 0; w < weeks; w++) {
        const eventId = g.rotation[(r + w) % g.rotation.length]!;
        const date = addDays(AS_OF, -7 * (weeks - 1 - w));
        out.push({ athleteKey: key, eventId, date, seconds: Math.round(ability * truth[eventId]! * Math.exp(noise * normal(rand))) });
      }
    }
  });
  return out;
}
