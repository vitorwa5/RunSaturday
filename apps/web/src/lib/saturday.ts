import { calendarDateIn, nextSaturday } from '@runsaturday/shared';

/** The Saturday the runner is planning for, in UK time. */
export const upcomingSaturday = (now = new Date()) => nextSaturday(calendarDateIn(now, 'Europe/London'));
