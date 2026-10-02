/**
 * Current Form (runner_form_v1) for a user: computed server-side from their performances and the
 * latest Course Speed Factors, and stored as a RunnerFormSnapshot so it is not recomputed on every
 * request. A snapshot is (re)calculated:
 *   - when the user's performances change (create / edit / delete),
 *   - by `npm run runner-form:recalculate` (and the seed), e.g. after new course factors,
 *   - lazily, once per day, when no snapshot exists for today yet.
 */
import type { FormReference, RunnerForm } from '@runsaturday/shared';
import { computeRunnerForm, RUNNER_FORM_V1, type FormCourseFactor } from '../analytics/runnerForm';
import { RUNNER_FORM_VERSION } from '../analytics/versions';
import type { DataStore } from '../repositories/DataStore';

export async function computeUserRunnerForm(store: DataStore, userId: string, today: string): Promise<RunnerForm> {
  const [performances, factors] = await Promise.all([store.listUserPerformances(userId), store.listCourseFactors()]);
  const factorMap = new Map<string, FormCourseFactor>(factors.map((f) => [f.eventId, { factor: f.factor, confidence: f.confidence }]));
  return computeRunnerForm(
    performances.map((p) => ({ ...p, eventName: p.eventName ?? p.externalEventName ?? 'Unknown event' })),
    factorMap,
    today,
  );
}

export async function recalculateRunnerForm(store: DataStore, userId: string, today: string): Promise<RunnerForm> {
  const form = await computeUserRunnerForm(store, userId, today);
  await store.saveRunnerFormSnapshot(userId, form);
  return form;
}

/** Today's snapshot, calculating it once if it does not exist yet. */
export async function currentRunnerForm(store: DataStore, userId: string, today: string): Promise<RunnerForm> {
  return (await store.getRunnerFormSnapshot(userId, RUNNER_FORM_V1.DISTANCE_METERS, RUNNER_FORM_VERSION, today)) ?? recalculateRunnerForm(store, userId, today);
}

/** The reference a forward-looking tool may use: only a real estimate, never an indicative value. */
export function formReferenceOf(form: RunnerForm): FormReference | null {
  return form.status === 'estimate' && form.formSeconds != null ? { formSeconds: form.formSeconds, confidence: form.confidence.level, version: form.version } : null;
}

/** Plain-language reason Current Form cannot be used. */
export const formUnavailableNote = (form: RunnerForm) => `Current Form unavailable: ${form.limitedReason ?? 'not enough recent performances at modelled courses.'}`;
