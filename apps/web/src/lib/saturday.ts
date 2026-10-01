import { calendarDateIn, nextSaturday, PLANNER_SATURDAYS, upcomingSaturdays } from '@runsaturday/shared';

const UK = 'Europe/London';

/** The Saturday the runner is planning for, in UK time. */
export const upcomingSaturday = (now = new Date()) => nextSaturday(calendarDateIn(now, UK));

/** Saturdays the planner offers (the API is authoritative; this is for instant UI). */
export const plannerSaturdays = (now = new Date()) => upcomingSaturdays(calendarDateIn(now, UK), PLANNER_SATURDAYS);
