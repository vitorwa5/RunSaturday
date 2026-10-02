/** Resolving which 5K time the performance tools use. */
import { parseFinishTime, type RunnerTimeSourceId, type UserPerformance, type UserProfile } from '@runsaturday/shared';

/** Current Form seconds, only when the model produced a real estimate (never an indicative value). */
export function currentFormSeconds(profile: UserProfile | undefined): number | null {
  return profile?.currentForm.status === 'estimate' ? profile.currentForm.formSeconds : null;
}

/** The recorded performance behind a preset (Current Form is a model estimate, so it has none). */
export function profilePerformance(source: RunnerTimeSourceId, profile: UserProfile | undefined): UserPerformance | null {
  if (source === 'recent') return profile?.performance.recentBest ?? null;
  if (source === 'pb') return profile?.performance.lifetimePb ?? null;
  if (source === 'parkrun') return profile?.performance.parkrunPb ?? null;
  return null;
}

/**
 * Forward-looking tools default to Current Form. Without one, the next best supported reference
 * (recent best, then the PBs); the UI says Current Form is unavailable.
 */
export function defaultRunnerTimeSource(profile: UserProfile | undefined): RunnerTimeSourceId {
  if (currentFormSeconds(profile) != null) return 'current';
  for (const source of ['recent', 'pb', 'parkrun'] as const) if (profilePerformance(source, profile)) return source;
  return 'manual';
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
  if (source === 'current') return currentFormSeconds(profile);
  return profilePerformance(source, profile)?.finishTimeSeconds ?? null;
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
