import { GOAL_IDS } from '@runsaturday/shared';
import { z } from 'zod';

export const OriginQuery = z
  .object({
    lat: z.coerce.number().min(-90).max(90).optional(),
    lon: z.coerce.number().min(-180).max(180).optional(),
  })
  .refine((q) => (q.lat == null) === (q.lon == null), { message: 'lat and lon must be given together', path: ['lat'] });

export const MaxTravel = z.coerce.number().int().min(5).max(600).optional();

export const GoalParam = z.enum(GOAL_IDS as [string, ...string[]]);
