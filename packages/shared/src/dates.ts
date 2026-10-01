/**
 * Calendar helpers. Event dates are calendar dates (no time zone), represented as
 * ISO "YYYY-MM-DD" strings. All arithmetic is done in UTC to avoid DST shifts.
 */

const SATURDAY = 6;

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Calendar date of `now` in the given IANA time zone, as "YYYY-MM-DD". */
export function calendarDateIn(now: Date, timeZone: string): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/**
 * The upcoming Saturday on or after `fromIsoDate`. On a Saturday this returns the same day,
 * because "this Saturday" is still the one the runner is planning for.
 */
export function nextSaturday(fromIsoDate: string): string {
  const d = new Date(`${fromIsoDate}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) throw new RangeError(`Invalid ISO date: ${fromIsoDate}`);
  const offset = (SATURDAY - d.getUTCDay() + 7) % 7;
  d.setUTCDate(d.getUTCDate() + offset);
  return toIsoDate(d);
}

/** Add whole days to an ISO date. */
export function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return toIsoDate(d);
}

/** "Saturday, 3 October" style label for an ISO date. */
export function formatLongDate(isoDate: string, locale = 'en-GB'): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  const weekday = new Intl.DateTimeFormat(locale, { weekday: 'long', timeZone: 'UTC' }).format(date);
  const dayMonth = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(date);
  return `${weekday}, ${dayMonth}`;
}

/** The next `count` Saturdays starting with the upcoming one. */
export function upcomingSaturdays(fromIsoDate: string, count: number): string[] {
  const first = nextSaturday(fromIsoDate);
  return Array.from({ length: count }, (_, i) => addDays(first, 7 * i));
}

/** "3 Oct" style label for an ISO date. */
export function formatShortDate(isoDate: string, locale = 'en-GB'): string {
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(new Date(`${isoDate}T00:00:00Z`));
}
