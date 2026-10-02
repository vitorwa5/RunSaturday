import type { CompareResponse, EventPlacement, PlacementResponse, PlannerResponse, RunnerForm, UserProfile } from '@runsaturday/shared';
import { afterEach, describe, expect, it } from 'vitest';
import { MemoryDataStore } from '../repositories/memory/MemoryDataStore';
import { buildTestApp } from './helpers';

let app: Awaited<ReturnType<typeof buildTestApp>>;
afterEach(async () => app?.close());

const get = async <T>(url: string) => (await app.inject(url)).json<T>();
const factorOf = async (eventId: string) => (await get<{ courseSpeed: { factor: number } }>(`/api/events/${eventId}/analytics`)).courseSpeed.factor;

/** A store whose demo user has no performances at all. */
function storeWithoutPerformances() {
  const memory = new MemoryDataStore('2026-10-01');
  const store = Object.create(memory) as MemoryDataStore;
  store.listUserPerformances = async () => [];
  return store;
}

describe('Current Form API (runner_form_v1)', () => {
  it('serves Current Form with its explanation, separate from the PBs and the recent best', async () => {
    app = await buildTestApp();
    const form = await get<RunnerForm>('/api/profile/current-form');
    expect(form).toMatchObject({ version: 'runner_form_v1', distanceMeters: 5000, status: 'estimate', formSeconds: 1202, method: { horizonDays: 180, halfLifeDays: 45 } });
    expect(form.confidence.level).toBe('high');
    expect(form.trend.direction).toBe('stable');
    // The 18:58 Overall 5K PB from ~30 weeks ago is history, not current ability.
    const profile = await get<UserProfile>('/api/profile');
    const pb = profile.performance.lifetimePb!;
    expect(form.excluded).toContainEqual(expect.objectContaining({ performanceId: pb.id, reason: 'outside_horizon' }));
    expect(form.inputs.some((i) => i.performanceId === pb.id)).toBe(false);
    expect(profile.performance.parkrunPb?.id).toBe(pb.id);
    expect(profile.recentPbSeconds).toBe(1172);
    expect(form.inputs.reduce((s, i) => s + i.share, 0)).toBeCloseTo(1, 2);
  });

  it('Where Could I Place? with basis=current_form converts form × target factor (never ÷ a source factor)', async () => {
    app = await buildTestApp();
    const body = await get<PlacementResponse>('/api/placement?basis=current_form&maxTravel=90&window=all&time=15:00&source=demo-riverside-5k');
    expect(body).toMatchObject({ mode: 'adjusted', source: null, timeSeconds: 1202, formReference: { formSeconds: 1202, confidence: 'high', version: 'runner_form_v1' } });
    expect(body.notes[0]).toMatch(/^Current Form estimates your present 5K capability from your strongest supported recent performances, adjusted for course differences\./);
    const forest = body.results.find((r) => r.event.id === 'demo-forest-trail-5k')!;
    expect(forest.adjustment).toMatchObject({ sourceKind: 'current_form', sourceEventId: null, sourceEventName: 'Current Form', sourceSeconds: 1202 });
    expect(forest.analysedSeconds).toBe(Math.round(1202 * (await factorOf('demo-forest-trail-5k'))));
    const riverside = body.results.find((r) => r.event.id === 'demo-riverside-5k')!;
    expect(riverside.analysedSeconds).toBe(Math.round(1202 * (await factorOf('demo-riverside-5k'))));
    // Raw time keeps the exact Current Form time everywhere.
    const raw = await get<PlacementResponse>('/api/placement?basis=current_form&mode=raw&maxTravel=90');
    expect(raw.mode).toBe('raw');
    expect(raw.results.every((r) => r.analysedSeconds === 1202 && r.adjustment == null)).toBe(true);
  });

  it('keeps Overall 5K PB and parkrun PB independently selectable', async () => {
    app = await buildTestApp();
    const profile = await get<UserProfile>('/api/profile');
    const pb = profile.performance.lifetimePb!;
    const parkrun = profile.performance.parkrunPb!;
    const byPb = await get<PlacementResponse>(`/api/placement?time=${pb.finishTimeSeconds}&source=${pb.eventId}&maxTravel=90`);
    expect(byPb).toMatchObject({ mode: 'adjusted', formReference: null, timeSeconds: 1138, source: { eventId: 'demo-riverside-5k' } });
    const byParkrun = await get<PlacementResponse>(`/api/placement?time=${parkrun.finishTimeSeconds}&source=${parkrun.eventId}&maxTravel=90`);
    expect(byParkrun.timeSeconds).toBe(parkrun.finishTimeSeconds);
  });

  it('drives the Event outlook and Compare from Current Form', async () => {
    app = await buildTestApp();
    const outlook = await get<EventPlacement>('/api/events/demo-moorland-edge-5k/placement?basis=current_form');
    expect(outlook.adjustment).toMatchObject({ available: true, sourceKind: 'current_form', sourceEventId: null });
    expect(outlook.analysedSeconds).toBe(Math.round(1202 * (await factorOf('demo-moorland-edge-5k'))));
    const compare = await get<CompareResponse>('/api/compare?ids=demo-riverside-5k,demo-forest-trail-5k&basis=current_form');
    expect(compare).toMatchObject({ mode: 'adjusted', source: null, timeSeconds: 1202, formReference: { formSeconds: 1202 } });
    expect(compare.events.every((r) => r.placement?.adjustment?.sourceKind === 'current_form')).toBe(true);
  });

  it('uses Current Form in the Planner only for goals that depend on ability', async () => {
    app = await buildTestApp();
    const place = await get<PlannerResponse>('/api/planner?goal=place');
    expect(place.ability).toMatchObject({ usesCurrentForm: true, formReference: { formSeconds: 1202 } });
    expect(place.ability.note).toMatch(/Current Form ≈ 20:02/);
    const pb = await get<PlannerResponse>('/api/planner');
    expect(pb.ability).toMatchObject({ usesCurrentForm: false, formReference: null });
  });

  it('says so when Current Form is unavailable, and never substitutes an old PB', async () => {
    app = await buildTestApp(storeWithoutPerformances());
    const form = await get<RunnerForm>('/api/profile/current-form');
    expect(form).toMatchObject({ status: 'unavailable', formSeconds: null, limitedReason: 'No recorded 5K performances yet.' });
    const res = await app.inject('/api/placement?basis=current_form');
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toEqual({ code: 'form_unavailable', message: 'Current Form unavailable: No recorded 5K performances yet.' });
    const planner = await get<PlannerResponse>('/api/planner?goal=place');
    expect(planner.ability).toEqual({
      usesCurrentForm: false,
      formReference: null,
      note: 'Current Form unavailable: No recorded 5K performances yet. Your Overall 5K PB is not used as current ability. High Finish falls back to the lowest Competition Score.',
    });
    const profile = await get<UserProfile>('/api/profile');
    expect([profile.current5kEstimateSeconds, profile.currentFormGapToOverallPbSeconds]).toEqual([null, null]);
  });

  it('recalculates Current Form when performances change', async () => {
    app = await buildTestApp();
    const before = (await get<RunnerForm>('/api/profile/current-form')).formSeconds!;
    const created = await app.inject({ method: 'POST', url: '/api/profile/performances', payload: { eventId: 'demo-riverside-5k', date: '2026-09-26', time: '18:50' } });
    expect(created.statusCode).toBe(201);
    const after = await get<RunnerForm>('/api/profile/current-form');
    expect(after.formSeconds!).toBeLessThan(before);
    expect(after.lastPerformanceDate).toBe('2026-09-26');
    await app.inject({ method: 'DELETE', url: `/api/profile/performances/${created.json().id}` });
    expect((await get<RunnerForm>('/api/profile/current-form')).formSeconds).toBe(before);
    // External races never enter Current Form.
    await app.inject({ method: 'POST', url: '/api/profile/performances', payload: { externalEventName: 'Warrington 5K', performanceType: 'road_race', date: '2026-09-26', time: '18:30' } });
    const withExternal = await get<RunnerForm>('/api/profile/current-form');
    expect(withExternal.formSeconds).toBe(before);
    expect(withExternal.excluded).toContainEqual(expect.objectContaining({ eventName: 'Warrington 5K', reason: 'course_not_modelled' }));
  });
});
