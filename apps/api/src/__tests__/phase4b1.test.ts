/** Phase 4B.1: refresh dependency, Current Form conversion, and planner goal inputs. */
import { addDays, type BestPickResponse, type EventPlacement, type HiddenGemsResponse, type PlannerResponse, type RunnerForm } from '@runsaturday/shared';
import { afterEach, describe, expect, it } from 'vitest';
import type { CourseFactorResult } from '../analytics/courseSpeed';
import { refreshAll } from '../analytics/refreshAll';
import { computeRunnerForm, type FormCourseFactor } from '../analytics/runnerForm';
import { MemoryDataStore } from '../repositories/memory/MemoryDataStore';
import { adjustFromForm } from '../services/courseAdjustment';
import { currentRunnerForm } from '../services/runnerForm';
import { buildTestApp } from './helpers';

const TODAY = '2026-10-01';
let app: Awaited<ReturnType<typeof buildTestApp>>;
afterEach(async () => app?.close());
const get = async <T>(url: string) => (await app.inject(url)).json<T>();

/** A store whose Course Speed Factors can be replaced, as a factor recalculation would. */
function storeWithSwappableFactors() {
  const memory = new MemoryDataStore(TODAY);
  const store = Object.create(memory) as MemoryDataStore & { swapFactors: (scale: Record<string, number>) => Promise<void> };
  let factors: Promise<CourseFactorResult[]> = memory.listCourseFactors();
  store.listCourseFactors = () => factors;
  store.swapFactors = async (scale) => {
    const current = await factors;
    factors = Promise.resolve(current.map((f) => (scale[f.eventId] && f.factor != null ? { ...f, factor: f.factor * scale[f.eventId]! } : f)));
  };
  return store;
}

describe('canonical refresh: Course Speed Factors → … → Runner Form', () => {
  it('recalculates Current Form from the NEW factors in the same refresh, after event analytics', async () => {
    const store = storeWithSwappableFactors();
    // 1–2. Factors, then Current Form from them.
    const before = await currentRunnerForm(store, 'demo-user', TODAY);
    expect(before.inputs.find((i) => i.eventId === 'demo-riverside-5k')!.courseFactor).toBeCloseTo(0.969, 3);

    // 3–4. A factor changes during the canonical refresh's event-analytics step.
    const order: string[] = [];
    const result = await refreshAll({
      recalculateEventAnalytics: async () => {
        order.push('event analytics');
        await store.swapFactors({ 'demo-riverside-5k': 1.05 });
        return 'events done';
      },
      store: new Proxy(store, {
        get(target, prop, receiver) {
          if (prop === 'saveRunnerFormSnapshot') order.push('runner form');
          return Reflect.get(target, prop, receiver);
        },
      }),
      listUserIds: async () => ['demo-user'],
      asOfDate: TODAY,
    });

    // 5. Current Form now uses the new factor, and the step order is fixed.
    expect(order).toEqual(['event analytics', 'runner form']);
    expect(result.runnerForms).toEqual({ users: 1, estimate: 1, indicative: 0, unavailable: 0 });
    const after = (await store.getRunnerFormSnapshot('demo-user', 5000, 'runner_form_v1', TODAY))!;
    const riverside = after.inputs.find((i) => i.eventId === 'demo-riverside-5k')!;
    expect(riverside.courseFactor).toBeCloseTo(0.969 * 1.05, 3);
    expect(after.formSeconds).not.toBe(before.formSeconds);
    expect(after.formSeconds).toBe((await currentRunnerForm(store, 'demo-user', TODAY)).formSeconds);
  });

  it('without the refresh, a same-day snapshot would still reflect the old factors (why the dependency matters)', async () => {
    const store = storeWithSwappableFactors();
    const before = await currentRunnerForm(store, 'demo-user', TODAY);
    await store.swapFactors({ 'demo-riverside-5k': 1.05 });
    expect((await currentRunnerForm(store, 'demo-user', TODAY)).formSeconds).toBe(before.formSeconds);
  });
});

describe('Current Form conversion (unchanged maths)', () => {
  const factors = new Map<string, FormCourseFactor>([
    ['a', { factor: 0.97, confidence: { level: 'high', score: 90 } }],
    ['b', { factor: 1.04, confidence: { level: 'high', score: 90 } }],
  ]);
  const runs = ['22:05', '22:08', '22:03', '22:10', '22:06'].map((t, i) => {
    const [m, s] = t.split(':').map(Number) as [number, number];
    return { id: `r${i}`, eventId: i % 2 ? 'a' : 'b', eventName: 'x', date: addDays('2026-09-26', -7 * i), finishTimeSeconds: m * 60 + s, distanceMeters: 5000 };
  });
  const target = (factor: number): CourseFactorResult => ({ factor, confidence: { level: 'high', score: 90, factors: [] } }) as unknown as CourseFactorResult;

  it('converts Current Form as form × target factor, never dividing by a source factor', () => {
    const form = computeRunnerForm(runs, factors, '2026-09-27');
    const adj = adjustFromForm({ formSeconds: form.formSeconds!, confidence: 'high', version: form.version }, { eventId: 'b' }, target(1.04));
    expect(adj).toMatchObject({ sourceKind: 'current_form', sourceEventId: null, equivalentSeconds: Math.round(form.formSeconds! * 1.04), ratio: 1.04 });
  });

  it('is unaffected by rescaling every course factor by a common constant (cohort reference cancels out)', () => {
    const base = computeRunnerForm(runs, factors, '2026-09-27');
    for (const c of [0.9, 1.1, 1.25]) {
      const scaled = new Map([...factors].map(([k, f]) => [k, { ...f, factor: f.factor! * c }]));
      const moved = computeRunnerForm(runs, scaled, '2026-09-27');
      // The reference scale moves by 1/c, but the equivalent at any target does not (±1 s rounding).
      for (const t of [0.97, 1.04, 1.1]) {
        const original = Math.round(base.formSeconds! * t);
        const rescaled = adjustFromForm({ formSeconds: moved.formSeconds!, confidence: 'high', version: moved.version }, { eventId: 'x' }, target(t * c)).equivalentSeconds!;
        expect(Math.abs(rescaled - original)).toBeLessThanOrEqual(1);
      }
      expect(moved.confidence).toEqual(base.confidence);
      expect(moved.trend).toEqual(base.trend);
    }
  });
});

describe('Saturday Planner: goal-by-goal use of Current Form', () => {
  const noPerformances = () => {
    const memory = new MemoryDataStore(TODAY);
    const store = Object.create(memory) as MemoryDataStore;
    store.listUserPerformances = async () => [];
    return store;
  };
  const fasterRunner = () => {
    const memory = new MemoryDataStore(TODAY);
    const store = Object.create(memory) as MemoryDataStore;
    store.listUserPerformances = async (userId, filter) => (await memory.listUserPerformances(userId, filter)).map((p) => ({ ...p, finishTimeSeconds: Math.round(p.finishTimeSeconds * 0.9) }));
    return store;
  };

  it('High Finish ranks by Current Form converted to each course through the placement engine', async () => {
    app = await buildTestApp();
    const plan = await get<PlannerResponse>('/api/planner?goal=place&maxTravel=90');
    expect(plan.ability).toMatchObject({ usesCurrentForm: true, formReference: { formSeconds: 1218 } });
    expect(plan.ability.note).toMatch(/^High Finish uses your Current Form ≈ 20:18/);
    expect(plan.method).toBe('ranked by how often your Current Form, converted to each course, historically reached the top 10');
    const first = plan.results[0]!;
    expect(first.rankedBy).toMatchObject({ key: 'historical_top10', unit: '%' });
    expect(first.reasons[0]!.text).toMatch(/^Top 10 in \d+ of \d+ recent events with your Current Form ≈ 20:18 \(≈ \d{2}:\d{2} here\)$/);
    // The value is exactly the placement engine's conservative top-10 share for the converted form.
    const placement = await get<EventPlacement>(`/api/events/${first.event.id}/placement?basis=current_form&window=90`);
    const f = placement.stats!.frequencies.top10;
    expect(first.rankedBy.value).toBe(Math.round((100 * f.count) / f.of));
    const values = plan.results.filter((r) => !r.reasons[0]!.tone.includes('caution')).map((r) => r.rankedBy.value!);
    expect(values).toEqual([...values].sort((a, b) => b - a));
    // Home best pick uses the same inputs.
    const pick = await get<BestPickResponse>('/api/recommendations/best-pick?goal=place&maxTravel=90');
    expect(pick.pick?.event.id).toBe(first.event.id);
  });

  it('High Finish changes with Current Form, and falls back transparently without it', async () => {
    app = await buildTestApp(fasterRunner());
    const faster = await get<PlannerResponse>('/api/planner?goal=place&maxTravel=90');
    await app.close();
    app = await buildTestApp();
    const normal = await get<PlannerResponse>('/api/planner?goal=place&maxTravel=90');
    expect(faster.ability.formReference!.formSeconds).toBeLessThan(normal.ability.formReference!.formSeconds);
    const share = (p: PlannerResponse) => p.results.reduce((s, r) => s + (r.rankedBy.value ?? 0), 0);
    expect(share(faster)).toBeGreaterThan(share(normal));
    await app.close();

    app = await buildTestApp(noPerformances());
    const fallback = await get<PlannerResponse>('/api/planner?goal=place&maxTravel=90');
    expect(fallback.ability).toMatchObject({ usesCurrentForm: false, formReference: null });
    expect(fallback.ability.note).toMatch(/Current Form unavailable.*High Finish falls back to the lowest Competition Score/);
    expect(fallback.method).toBe('ranked using lowest Competition Score (Current Form unavailable)');
    expect(fallback.results[0]!.rankedBy.key).toBe('competition_score');
  });

  it('Hidden Gem uses the same Current Form-based hidden_gem_v1 scores as the Hidden Gems tool', async () => {
    app = await buildTestApp();
    const plan = await get<PlannerResponse>('/api/planner?goal=hidden_gem&maxTravel=90');
    const gems = await get<HiddenGemsResponse>('/api/hidden-gems?maxTravel=90');
    expect(plan.ability.usesCurrentForm).toBe(true);
    const planScores = new Map(plan.results.map((r) => [r.event.id, r.rankedBy.value]));
    for (const g of gems.results) if (planScores.has(g.event.id)) expect(planScores.get(g.event.id)).toBe(g.gemScore);
  });

  it.each(['pb', 'new_event', 'quiet'] as const)('%s does not depend on Current Form', async (goal) => {
    app = await buildTestApp();
    const withForm = await get<PlannerResponse>(`/api/planner?goal=${goal}&maxTravel=90`);
    await app.close();
    app = await buildTestApp(fasterRunner());
    const otherForm = await get<PlannerResponse>(`/api/planner?goal=${goal}&maxTravel=90`);
    expect(withForm.ability).toMatchObject({ usesCurrentForm: false, formReference: null });
    expect(withForm.ability.note).toMatch(/does not depend on your ability/);
    if (goal !== 'new_event') {
      // Same ranking whatever the runner's form (new_event depends only on visits, unchanged here).
      expect(otherForm.results.map((r) => [r.event.id, r.rankedBy.value])).toEqual(withForm.results.map((r) => [r.event.id, r.rankedBy.value]));
    }
  });
});

describe('Runner Form snapshots after refresh', () => {
  it('serve the refreshed form to the API', async () => {
    const store = storeWithSwappableFactors();
    await refreshAll({ recalculateEventAnalytics: async () => store.swapFactors({ 'demo-riverside-5k': 1.05 }), store, listUserIds: async () => ['demo-user'], asOfDate: TODAY });
    app = await buildTestApp(store);
    const form = await get<RunnerForm>('/api/profile/current-form');
    expect(form.inputs.find((i) => i.eventId === 'demo-riverside-5k')!.courseFactor).toBeCloseTo(0.969 * 1.05, 3);
  });
});
