import { GOAL_IDS, HISTORY_WINDOWS, MAX_FINISH_SECONDS, MIN_FINISH_SECONDS, parseFinishTime, TRAVEL_LIMIT_OPTIONS } from '@runsaturday/shared';
import { AppError } from './errors';
import { z } from 'zod';

export const OriginQuery = z
  .object({
    lat: z.coerce.number().min(-90).max(90).optional(),
    lon: z.coerce.number().min(-180).max(180).optional(),
  })
  .refine((q) => (q.lat == null) === (q.lon == null), { message: 'lat and lon must be given together', path: ['lat'] });

export const MaxTravel = z.coerce.number().int().min(5).max(600).optional();

export const GoalParam = z.enum(GOAL_IDS as [string, ...string[]]);

export const WindowParam = z.enum(HISTORY_WINDOWS.map((w) => w.id) as [string, ...string[]]);

export const TravelOption = z.coerce
  .number()
  .int()
  .refine((n) => (TRAVEL_LIMIT_OPTIONS as readonly number[]).includes(n));

/** Options lists → zod enum. */
export const idsOf = <T extends readonly { id: string }[]>(options: T) => options.map((o) => o.id) as [T[number]['id'], ...T[number]['id'][]];

export const INVALID_TIME_MESSAGE = 'Enter a 5K time like 19:30 or 1:05:30.';

/** A 5K time given as whole seconds ("1170") or as "mm:ss" / "h:mm:ss" ("19:30"). */
export function parseTimeParam(raw: unknown): number {
  if (typeof raw === 'string') {
    const value = /^\d+$/.test(raw) ? Number(raw) : parseFinishTime(raw);
    if (value != null && value >= MIN_FINISH_SECONDS && value <= MAX_FINISH_SECONDS) return value;
  }
  throw new AppError(400, 'invalid_time', INVALID_TIME_MESSAGE);
}
