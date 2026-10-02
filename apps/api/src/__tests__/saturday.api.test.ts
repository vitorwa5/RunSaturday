import { GOALS, type BestPickResponse, type SaturdayRecommendationsResponse } from '@runsaturday/shared';
import { afterEach, describe, expect, it } from 'vitest';
import { buildTestApp } from './helpers';

let app: Awaited<ReturnType<typeof buildTestApp>>;
afterEach(async () => app?.close());
const get = async <T>(url: string) => (await app.inject(url)).json<T>();

describe('GET /api/saturday/recommendations (Phase 5B)', () => {
  it('answers every intent with a best match, alternatives and reasons, from the demo data', async () => {
    app = await buildTestApp();
    for (const { id } of GOALS) {
      const r = await get<SaturdayRecommendationsResponse>(`/api/saturday/recommendations?intent=${id}&maxTravel=90`);
      expect(r.intent).toBe(id);
      expect(r.bestPick, id).not.toBeNull();
      expect(r.alternatives.length, id).toBeLessThanOrEqual(3);
      for (const rec of [r.bestPick!, ...r.alternatives]) {
        expect(rec.why!.length, `${id} ${rec.event.name}`).toBeGreaterThanOrEqual(2);
        expect(rec.why!.length).toBeLessThanOrEqual(4);
      }
      expect(JSON.stringify(r)).not.toMatch(/Saturday Score|guaranteed|you will (run|finish)|predicted winner/i);
    }
  });

  it('serves Home (best-pick) and the Saturday Planner from the same orchestrator', async () => {
    app = await buildTestApp();
    for (const { id } of GOALS) {
      const home = await get<BestPickResponse>(`/api/recommendations/best-pick?goal=${id}`);
      const saturday = await get<SaturdayRecommendationsResponse>(`/api/saturday/recommendations?intent=${id}`);
      const planner = await get<SaturdayRecommendationsResponse>(`/api/planner?goal=${id}`);
      expect(home.pick?.event.id, id).toBe(saturday.bestPick?.event.id);
      expect(home.alternatives.map((a) => a.event.id)).toEqual(saturday.alternatives.map((a) => a.event.id));
      expect(planner.results.map((x) => x.event.id)).toEqual(saturday.results.map((x) => x.event.id));
    }
  });

  it('takes challenge context from the URL (case-insensitive item) and says when nothing matches', async () => {
    app = await buildTestApp();
    const h = await get<SaturdayRecommendationsResponse>('/api/saturday/recommendations?intent=challenge&challenge=alphabet&item=h&maxTravel=90');
    expect(h.results.map((x) => x.event.name)).toEqual(['Heath Common 5K']);
    expect(h.bestPick!.why![0]).toBe('Completes Alphabet — H');
    expect(h.challenge).toMatchObject({ challengeId: 'alphabet', itemKey: 'H', progress: { current: 4, target: 25 } });
    const b = await get<SaturdayRecommendationsResponse>('/api/saturday/recommendations?intent=challenge&challenge=alphabet&item=B');
    expect([b.bestPick, b.message]).toEqual([null, 'No event in the current 5K Compass dataset completes B. More events may be added later.']);
  });

  it('Visit somewhere new never shows a visited event, even a favourite', async () => {
    app = await buildTestApp();
    const r = await get<SaturdayRecommendationsResponse>('/api/saturday/recommendations?intent=new_event&maxTravel=90');
    expect(r.results.map((x) => x.event.id)).not.toEqual(expect.arrayContaining(['demo-riverside-5k']));
    expect(r.results.every((x) => x.event.visited === false)).toBe(true);
    expect(r.defaultsApplied).toEqual(['Only events you have not visited']);
  });

  it('Surprise me is stable for a Saturday and rotates with the offset', async () => {
    app = await buildTestApp();
    const a = await get<SaturdayRecommendationsResponse>('/api/saturday/recommendations?intent=surprise&maxTravel=90');
    const again = await get<SaturdayRecommendationsResponse>('/api/saturday/recommendations?intent=surprise&maxTravel=90');
    expect(again.bestPick!.event.id).toBe(a.bestPick!.event.id);
    expect(a.surprise!.shortlist).toBeGreaterThan(1);
    const next = await get<SaturdayRecommendationsResponse>('/api/saturday/recommendations?intent=surprise&maxTravel=90&offset=1');
    expect(next.bestPick!.event.id).not.toBe(a.bestPick!.event.id);
  });

  it('accepts the legacy goal parameter and validates input', async () => {
    app = await buildTestApp();
    expect((await get<SaturdayRecommendationsResponse>('/api/saturday/recommendations?goal=quiet')).intent).toBe('quiet');
    for (const bad of ['intent=nope', 'maxTravel=37', 'offset=-1', 'date=2026-09-26']) {
      expect((await app.inject(`/api/saturday/recommendations?${bad}`)).statusCode, bad).toBe(400);
    }
  });
});
