import type { ChallengeOpportunitiesResponse, ChallengeResult, ChallengesResponse, EventDetail, EventSummary, EventVisitSummary, ExploreSummary } from '@runsaturday/shared';
import { afterEach, describe, expect, it } from 'vitest';
import { buildTestApp } from './helpers';

let app: Awaited<ReturnType<typeof buildTestApp>>;
afterEach(async () => app?.close());
const get = async <T>(url: string) => (await app.inject(url)).json<T>();

describe('Explore & Challenges API (Phase 5A)', () => {
  it('summarises exploration from the demo performances, honestly', async () => {
    app = await buildTestApp();
    const s = await get<ExploreSummary>('/api/profile/explore-summary');
    expect(s).toMatchObject({
      eventsVisited: 4,
      totalRuns: 43,
      externalRuns: 0,
      repeatVisits: 39,
      eventsInDataset: 10,
      mostVisited: { eventId: 'demo-riverside-5k', eventName: 'Riverside 5K', visitCount: 34 },
      challengesCompleted: 0,
      challenges: [{ id: 'alphabet', name: 'Alphabet Challenge', status: 'in_progress', progress: { current: 4, target: 25, percentage: 16 } }],
    });
    expect(s.visitedEvents.map((e) => [e.eventName, e.visitCount])).toEqual(
      expect.arrayContaining([
        ['Riverside 5K', 34],
        ['Victoria Park 5K', 6],
        ['Lakeside 5K', 2],
        ['Forest Trail 5K', 1],
      ]),
    );
  });

  it('serves the Alphabet Challenge with completed letters, missing letters and dataset opportunities', async () => {
    app = await buildTestApp();
    const list = await get<ChallengesResponse>('/api/profile/challenges');
    expect(list.challenges.map((c) => c.id)).toEqual(['alphabet']);
    const a = await get<ChallengeResult>('/api/profile/challenges/alphabet');
    expect(a.completedItems).toEqual(['F', 'L', 'R', 'V']);
    expect(a.items.find((i) => i.key === 'R')!.completedBy).toMatchObject({ eventName: 'Riverside 5K' });
    expect(a.items.filter((i) => i.opportunities.length > 0).map((i) => [i.key, i.opportunities.map((o) => o.eventName)])).toEqual([
      ['C', ['Canal Towpath 5K']],
      ['D', ['Dockside Promenade 5K']],
      ['E', ['Estuary Path 5K']],
      ['H', ['Heath Common 5K']],
      ['M', ['Moorland Edge 5K']],
      ['O', ['Old Mill Fields 5K']],
    ]);
    expect((await app.inject('/api/profile/challenges/nope')).statusCode).toBe(404);
  });

  it('filters Explore by a challenge item (generic opportunity filter) with visit context', async () => {
    app = await buildTestApp();
    const c = await get<ChallengeOpportunitiesResponse>('/api/profile/challenges/alphabet/opportunities?item=c');
    expect(c.item).toEqual({ challengeId: 'alphabet', challengeName: 'Alphabet Challenge', itemKey: 'C', itemLabel: 'C' });
    expect(c.completed).toBe(false);
    expect(c.events.map((e) => [e.name, e.visited])).toEqual([['Canal Towpath 5K', false]]);
    const b = await get<ChallengeOpportunitiesResponse>('/api/profile/challenges/alphabet/opportunities?item=B');
    expect(b.events).toEqual([]); // no B event in the dataset: nothing promised
    const r = await get<ChallengeOpportunitiesResponse>('/api/profile/challenges/alphabet/opportunities?item=R');
    expect([r.completed, r.events.map((e) => e.visited)]).toEqual([true, [true]]);
    const bad = await app.inject('/api/profile/challenges/alphabet/opportunities?item=X');
    expect([bad.statusCode, bad.json().error.code]).toEqual([400, 'unknown_challenge_item']);
  });

  it('derives Explore visited / not-visited status from performances', async () => {
    app = await buildTestApp();
    const events = await get<EventSummary[]>('/api/events');
    expect(events.filter((e) => e.visited).map((e) => e.id).sort()).toEqual(['demo-forest-trail-5k', 'demo-lakeside-5k', 'demo-riverside-5k', 'demo-victoria-park-5k']);
    expect(events.filter((e) => e.visited === false)).toHaveLength(6);
  });

  it('gives the Event page its visit summary and the challenge items a visit would complete', async () => {
    app = await buildTestApp();
    expect(await get<EventVisitSummary>('/api/profile/events/demo-riverside-5k/visits')).toMatchObject({
      visited: true,
      visitCount: 34,
      firstVisit: '2025-03-29',
      latestVisit: '2026-09-12',
      pbSeconds: 1138,
      helpsWith: [],
    });
    expect(await get<EventVisitSummary>('/api/profile/events/demo-heath-common-5k/visits')).toEqual({
      eventId: 'demo-heath-common-5k',
      visited: false,
      visitCount: 0,
      firstVisit: null,
      latestVisit: null,
      pbSeconds: null,
      helpsWith: [{ challengeId: 'alphabet', challengeName: 'Alphabet Challenge', itemKey: 'H', itemLabel: 'H' }],
    });
    expect((await app.inject('/api/profile/events/nope/visits')).statusCode).toBe(404);
  });

  it('updates visits and challenge progress from performances only; clients cannot submit completion', async () => {
    app = await buildTestApp();
    const created = await app.inject({ method: 'POST', url: '/api/profile/performances', payload: { eventId: 'demo-canal-towpath-5k', date: '2026-09-26', time: '21:00' } });
    expect(created.statusCode).toBe(201);
    const a = await get<ChallengeResult>('/api/profile/challenges/alphabet');
    expect(a.completedItems).toEqual(['C', 'F', 'L', 'R', 'V']);
    expect((await get<EventDetail>('/api/events/demo-canal-towpath-5k')).visited).toBe(true);
    // An external race named like a missing letter does not count.
    await app.inject({ method: 'POST', url: '/api/profile/performances', payload: { externalEventName: 'Bolton 5K', performanceType: 'road_race', date: '2026-09-20', time: '20:30' } });
    expect((await get<ChallengeResult>('/api/profile/challenges/alphabet')).completedItems).not.toContain('B');
    expect((await get<ExploreSummary>('/api/profile/explore-summary'))).toMatchObject({ eventsVisited: 5, externalRuns: 1, totalRuns: 45 });
    for (const method of ['POST', 'PATCH', 'PUT'] as const) {
      expect((await app.inject({ method, url: '/api/profile/challenges/alphabet', payload: { status: 'completed' } })).statusCode).toBe(404);
    }
  });
});
