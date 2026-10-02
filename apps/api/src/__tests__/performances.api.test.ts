import type { EventSummary, PerformanceSummary, UserPerformance, UserPerformancesResponse, UserProfile } from '@runsaturday/shared';
import { afterEach, describe, expect, it } from 'vitest';
import { MemoryDataStore } from '../repositories/memory/MemoryDataStore';
import { buildTestApp } from './helpers';

let app: Awaited<ReturnType<typeof buildTestApp>>;
afterEach(async () => app?.close());

const post = (body: object) => app.inject({ method: 'POST', url: '/api/profile/performances', payload: body });
const patch = (id: string, body: object) => app.inject({ method: 'PATCH', url: `/api/profile/performances/${id}`, payload: body });
const del = (id: string) => app.inject({ method: 'DELETE', url: `/api/profile/performances/${id}` });
const profile = async () => (await app.inject('/api/profile')).json<UserProfile>();
const summary = async () => (await app.inject('/api/profile/performance-summary')).json<PerformanceSummary>();
const list = async (q = '') => (await app.inject(`/api/profile/performances${q}`)).json<UserPerformancesResponse>();

describe('personal performances API', () => {
  it('lists the demo user\'s performances newest first and derives the profile from them', async () => {
    app = await buildTestApp();
    const all = await list();
    expect(all.total).toBe(43);
    expect(all.performances.map((p) => p.date)).toEqual([...all.performances.map((p) => p.date)].sort().reverse());
    expect(all.performances[0]).toMatchObject({ source: 'manual', verified: false, editable: true });
    expect((await list('?limit=5')).performances).toHaveLength(5);
    expect((await list('?eventId=demo-lakeside-5k')).total).toBe(2);

    const p = await profile();
    expect(p).toMatchObject({
      lifetimePbSeconds: 1138,
      lifetimePbEvent: { id: 'demo-riverside-5k', name: 'Riverside 5K' },
      recentPbSeconds: 1172,
      recentPbEvent: { id: 'demo-riverside-5k', name: 'Riverside 5K' },
      runsCompleted: 43,
      uniqueEventsVisited: 4,
      current5kEstimateSeconds: 1180, // an estimate, kept separate
    });
    expect(p.performance.latest?.date).toBe(all.performances[0]!.date);
    expect(await summary()).toEqual(p.performance);
  });

  it('adds a manual performance that then appears everywhere it is derived', async () => {
    app = await buildTestApp();
    const res = await post({ eventId: 'demo-moorland-edge-5k', date: '2026-09-19', time: '21:05' });
    expect(res.statusCode).toBe(201);
    const created = res.json<UserPerformance>();
    expect(created).toMatchObject({ eventId: 'demo-moorland-edge-5k', eventName: 'Moorland Edge 5K', date: '2026-09-19', finishTimeSeconds: 1265, source: 'manual', editable: true });
    expect((await list()).total).toBe(44);
    const s = await summary();
    expect([s.totalPerformances, s.uniqueEvents]).toEqual([44, 5]);
    expect(s.events.find((e) => e.eventId === 'demo-moorland-edge-5k')).toMatchObject({ count: 1, pb: { finishTimeSeconds: 1265 } });
    // "Visited" is derived from performances too.
    const events = (await app.inject('/api/events')).json<EventSummary[]>();
    expect(events.find((e) => e.id === 'demo-moorland-edge-5k')?.visited).toBe(true);
  });

  it('accepts MM:SS and HH:MM:SS and unusual but possible times', async () => {
    app = await buildTestApp();
    for (const [date, time, seconds] of [
      ['2026-06-06', '13:01', 781],
      ['2026-06-13', '1:05:30', 3930],
      ['2026-06-20', '02:45:00', 9900],
      ['2026-06-27', '75:20', 4520],
    ] as const) {
      const res = await post({ eventId: 'demo-heath-common-5k', date, time });
      expect(res.statusCode).toBe(201);
      expect(res.json<UserPerformance>().finishTimeSeconds).toBe(seconds);
    }
  });

  it('rejects invalid times, unknown events and bad dates with readable messages', async () => {
    app = await buildTestApp();
    const base = { eventId: 'demo-heath-common-5k', date: '2026-09-19', time: '21:05' };
    for (const time of ['abc', '19:60', '11:59', '0:00', '10:00:00', '']) {
      const res = await post({ ...base, time });
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toEqual({ code: 'invalid_time', message: 'Enter a finish time like 19:35 or 1:05:30.' });
    }
    const unknown = await post({ ...base, eventId: 'no-such-event' });
    expect(unknown.statusCode).toBe(400);
    expect(unknown.json().error.code).toBe('unknown_event');
    for (const date of ['2026-02-30', '26-09-2026', 'yesterday', '1900-01-01']) expect((await post({ ...base, date })).json().error.code).toBe('invalid_date');
    const future = await post({ ...base, date: '2026-10-02' });
    expect(future.json().error).toEqual({ code: 'future_date', message: 'The date cannot be in the future.' });
    expect((await post({ eventId: 'x' })).statusCode).toBe(400);
    expect((await list()).total).toBe(43); // nothing was stored
  });

  it('rejects a duplicate at the same event on the same date, on create and on edit', async () => {
    app = await buildTestApp();
    const existing = (await list('?eventId=demo-lakeside-5k')).performances[0]!;
    const dup = await post({ eventId: 'demo-lakeside-5k', date: existing.date, time: '25:00' });
    expect(dup.statusCode).toBe(409);
    expect(dup.json().error.message).toMatch(/^You already have a performance at Lakeside 5K on .+\. Edit that one instead\.$/);
    // Another event on the same date is allowed.
    expect((await post({ eventId: 'demo-heath-common-5k', date: existing.date, time: '25:00' })).statusCode).toBe(201);
    const other = (await list('?eventId=demo-lakeside-5k')).performances[1]!;
    expect((await patch(other.id, { eventId: 'demo-lakeside-5k', date: existing.date, time: '25:00' })).statusCode).toBe(409);
  });

  it('edits a manual performance, keeping the derived values in step', async () => {
    app = await buildTestApp();
    const pb = (await summary()).lifetimePb!;
    const res = await patch(pb.id, { eventId: pb.eventId, date: pb.date, time: '18:40' });
    expect(res.statusCode).toBe(200);
    expect(res.json<UserPerformance>()).toMatchObject({ id: pb.id, finishTimeSeconds: 1120 });
    expect((await profile()).lifetimePbSeconds).toBe(1120);
    expect((await patch('nope', { eventId: pb.eventId, date: pb.date, time: '18:40' })).statusCode).toBe(404);
    expect((await patch(pb.id, { eventId: pb.eventId, date: pb.date, time: 'fast' })).statusCode).toBe(400);
    expect((await app.inject(`/api/profile/performances/${pb.id}`)).json<UserPerformance>().finishTimeSeconds).toBe(1120);
  });

  it('deletes a manual performance; lifetime PB and recent best fall back to the next best', async () => {
    app = await buildTestApp();
    const before = await summary();
    expect((await del(before.lifetimePb!.id)).statusCode).toBe(204);
    expect((await del(before.recentBest!.id)).statusCode).toBe(204);
    expect((await del(before.recentBest!.id)).statusCode).toBe(404);
    const after = await summary();
    expect(after.totalPerformances).toBe(41);
    expect(after.lifetimePb!.finishTimeSeconds).toBeGreaterThan(1138);
    expect(after.lifetimePb!.id).not.toBe(before.lifetimePb!.id);
    expect(after.recentBest!.finishTimeSeconds).toBeGreaterThan(1172);
    const p = await profile();
    expect([p.lifetimePbSeconds, p.recentPbSeconds]).toEqual([after.lifetimePb!.finishTimeSeconds, after.recentBest!.finishTimeSeconds]);
    expect(p.recentPbEvent).toEqual({ id: after.recentBest!.eventId, name: after.recentBest!.eventName });
  });

  it('drives the Where Could I Place? presets: a new recent best carries its own source event', async () => {
    app = await buildTestApp();
    await post({ eventId: 'demo-lakeside-5k', date: '2026-09-19', time: '19:00' });
    const p = await profile();
    expect(p.recentPbSeconds).toBe(1140);
    expect(p.recentPbEvent).toEqual({ id: 'demo-lakeside-5k', name: 'Lakeside 5K' });
    expect(p.lifetimePbSeconds).toBe(1138); // 18:58 at Riverside is still faster
    // The preset's time and source event go straight into a course-adjusted placement.
    const placement = (await app.inject(`/api/events/demo-forest-trail-5k/placement?time=${p.recentPbSeconds}&source=${p.recentPbEvent!.id}`)).json();
    expect(placement.adjustment).toMatchObject({ available: true, sourceEventName: 'Lakeside 5K', sourceSeconds: 1140 });
  });

  it('refuses to edit or delete imported (non-manual) performances', async () => {
    const memory = new MemoryDataStore('2026-10-01');
    const store = Object.create(memory) as MemoryDataStore;
    store.getUserPerformance = async (userId, id) => {
      const p = await memory.getUserPerformance(userId, id);
      return p ? { ...p, source: 'parkrun_api', verified: true } : null;
    };
    app = await buildTestApp(store);
    const id = (await list()).performances[0]!.id;
    const edit = await patch(id, { eventId: 'demo-riverside-5k', date: '2026-09-19', time: '20:00' });
    expect(edit.statusCode).toBe(403);
    expect(edit.json().error.code).toBe('read_only');
    expect((await del(id)).statusCode).toBe(403);
  });

  it('only exposes the current user\'s performances', async () => {
    app = await buildTestApp();
    const all = await list();
    expect(all.performances.every((p) => !('userId' in p))).toBe(true);
    expect((await app.inject('/api/profile/performances/someone-elses-id')).statusCode).toBe(404);
  });
});
