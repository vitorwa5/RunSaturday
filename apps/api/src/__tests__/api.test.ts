import { afterEach, describe, expect, it } from 'vitest';
import type { BestPickResponse, EventDetail, EventSummary } from '@runsaturday/shared';
import type { DataStore } from '../repositories/DataStore';
import { MemoryDataStore } from '../repositories/memory/MemoryDataStore';
import { buildTestApp } from './helpers';

let app: Awaited<ReturnType<typeof buildTestApp>>;
afterEach(async () => app?.close());

describe('API', () => {
  it('reports health and data source', async () => {
    app = await buildTestApp();
    const res = await app.inject('/api/health');
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: 'ok', dataSource: 'demo-memory', database: 'not_used' });
  });

  it('lists events with travel from the demo home and visit state', async () => {
    app = await buildTestApp();
    const events = (await app.inject('/api/events')).json<EventSummary[]>();
    expect(events).toHaveLength(10);
    const riverside = events.find((e) => e.slug === 'demo-riverside-5k')!;
    expect(riverside.source).toBe('demo');
    expect(riverside.visited).toBe(true);
    expect(riverside.travel?.method).toBe('straight_line_estimate');
  });

  it('returns nearby events nearest first within the limit', async () => {
    app = await buildTestApp();
    const events = (await app.inject('/api/events/nearby?limit=3&maxTravel=30')).json<EventSummary[]>();
    expect(events.length).toBeLessThanOrEqual(3);
    const minutes = events.map((e) => e.travel!.minutes);
    expect(minutes).toEqual([...minutes].sort((a, b) => a - b));
    expect(minutes.every((m) => m <= 30)).toBe(true);
  });

  it('searches by town, case-insensitively', async () => {
    app = await buildTestApp();
    const events = (await app.inject('/api/events/search?q=CHESTER')).json<EventSummary[]>();
    expect(events.map((e) => e.name)).toEqual(['Lakeside 5K']);
  });

  it('returns event detail with sample size and unknown facilities preserved', async () => {
    app = await buildTestApp();
    const res = await app.inject('/api/events/demo-heath-common-5k');
    expect(res.statusCode).toBe(200);
    const event = res.json<EventDetail>();
    expect(event.facilities.cafe).toBe('unknown');
    expect(event.occurrencesLast90Days).toBe(13);
    expect(event.recentOccurrences[0]!.date).toBe('2026-09-26');
  });

  it('recommends a best pick for the PB goal for next Saturday', async () => {
    app = await buildTestApp();
    const body = (await app.inject('/api/recommendations/best-pick?goal=pb')).json<BestPickResponse>();
    expect(body.date).toBe('2026-10-03');
    expect(body.pick?.event.name).toBe('Riverside 5K');
    expect(body.pick?.reasons.length).toBeGreaterThan(0);
  });

  it('rejects invalid input with a readable message', async () => {
    app = await buildTestApp();
    const res = await app.inject('/api/recommendations/best-pick?goal=fastest');
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: { code: 'invalid_request', message: 'Some request parameters are invalid. Check: goal.' } });
  });

  it('requires lat and lon together', async () => {
    app = await buildTestApp();
    expect((await app.inject('/api/events?lat=53.4')).statusCode).toBe(400);
  });

  it('returns 404 for unknown events and routes', async () => {
    app = await buildTestApp();
    expect((await app.inject('/api/events/does-not-exist')).statusCode).toBe(404);
    expect((await app.inject('/api/nope')).json()).toMatchObject({ error: { code: 'not_found' } });
  });

  it('never exposes raw technical errors to clients', async () => {
    const broken = new MemoryDataStore('2026-10-01') as DataStore;
    broken.listActiveEvents = async () => {
      throw new Error('list index out of range');
    };
    app = await buildTestApp(broken);
    const res = await app.inject('/api/events');
    expect(res.statusCode).toBe(500);
    expect(res.body).not.toContain('list index');
    expect(res.json()).toEqual({
      error: { code: 'internal_error', message: 'Something went wrong on our side. Please try again.' },
    });
  });

  it('serves the demo profile with current form separate from lifetime PB', async () => {
    app = await buildTestApp();
    const profile = (await app.inject('/api/profile')).json();
    expect(profile).toMatchObject({ isDemo: true, lifetimePbSeconds: 1138, current5kEstimateSeconds: 1180 });
    expect(profile.savedEventIds).toContain('demo-riverside-5k');
  });
});
