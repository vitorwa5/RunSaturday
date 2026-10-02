/** Resolving which 5K time the performance tools use. */
import { parseFinishTime, type RunnerTimeSourceId, type UserPerformance, type UserProfile } from '@runsaturday/shared';

export const PROFILE_TIME_FIELD = {
  current: 'current5kEstimateSeconds',
  recent: 'recentPbSeconds',
  pb: 'lifetimePbSeconds',
} as const satisfies Record<Exclude<RunnerTimeSourceId, 'manual'>, keyof UserProfile>;

/** The recorded performance behind a preset (current form is an estimate, so it has none). */
export function profilePerformance(source: RunnerTimeSourceId, profile: UserProfile | undefined): UserPerformance | null {
  if (source === 'recent') return profile?.performance.recentBest ?? null;
  if (source === 'pb') return profile?.performance.lifetimePb ?? null;
  return null;
}

/** Where a preset was achieved, when it is a known (modelled) event: the course-adjustment source. */
export function profileSourceEvent(source: RunnerTimeSourceId, profile: UserProfile | undefined): { id: string; name: string } | null {
  const p = profilePerformance(source, profile);
  return p?.eventId != null ? { id: p.eventId, name: p.eventName } : null;
}

/** The name of the course when a preset was run somewhere 5K Compass does not model. */
export function profileExternalCourse(source: RunnerTimeSourceId, profile: UserProfile | undefined): string | null {
  const p = profilePerformance(source, profile);
  return p != null && !p.courseModelled ? p.eventName : null;
}

/** The time for a source, or null when the profile has none / manual time is invalid. */
export function resolveRunnerTime(source: RunnerTimeSourceId, profile: UserProfile | undefined, manualSeconds: number | null): number | null {
  if (source === 'manual') return manualSeconds;
  return profile?.[PROFILE_TIME_FIELD[source]] ?? null;
}

export const MANUAL_TIME_ERROR = 'Enter a time like 19:30 or 1:05:30.';

/** Validate manual input ("19:30", "1:05:30"); returns seconds or an error message. */
export function validateManualTime(input: string): { seconds: number } | { error: string } {
  const seconds = parseFinishTime(input);
  return seconds == null ? { error: MANUAL_TIME_ERROR } : { seconds };
}

/** Compare ids from the URL: de-duplicated, at most `max`, empty values dropped. */
export function parseIdList(raw: string | null, max: number): string[] {
  if (!raw) return [];
  return [...new Set(raw.split(',').map((s) => s.trim()).filter(Boolean))].slice(0, max);
}
