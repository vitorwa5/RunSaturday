import { afterEach, describe, expect, it } from 'vitest';
import type {
  BestPickResponse,
  CompareResponse,
  EventDetail,
  EventHistoryResponse,
  EventPlacement,
  EventSummary,
  HiddenGemsResponse,
  PbFinderResponse,
  PlacementResponse,
  PlannerResponse,
} from '@runsaturday/shared';
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
    expect(body.pick?.highlights).toEqual(['Fast', 'Flat', 'Tarmac']);
    expect(body.alternatives).toHaveLength(3);
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

  describe('planner', () => {
    const plan = async (query = '') => (await app.inject(`/api/planner${query}`)).json<PlannerResponse>();

    it('defaults to next Saturday, the demo home and the profile travel limit', async () => {
      app = await buildTestApp();
      const body = await plan();
      expect(body.date).toBe('2026-10-03');
      expect(body.availableDates).toEqual(['2026-10-03', '2026-10-10', '2026-10-17', '2026-10-24']);
      expect(body.origin).toEqual({ label: 'Warrington (demo home)', source: 'home' });
      expect(body.maxTravelMinutes).toBe(45);
      expect(body.goal).toBe('pb');
      expect(body.results.map((r) => r.rank)).toEqual(body.results.map((_, i) => i + 1));
      expect(body.results.every((r) => r.event.travel!.minutes <= 45)).toBe(true);
      expect(body.results[0]!.event.name).toBe('Riverside 5K');
      expect(body.notes.length).toBeGreaterThan(0);
    });

    it('narrows results with the travel limit and filters', async () => {
      app = await buildTestApp();
      const wide = await plan('?maxTravel=90');
      const narrow = await plan('?maxTravel=15');
      expect(narrow.results.length).toBeLessThan(wide.results.length);

      const trail = await plan('?maxTravel=90&surface=trail');
      expect(trail.results.length).toBeGreaterThan(0);
      expect(trail.results.every((r) => r.event.surface === 'trail')).toBe(true);
      expect(trail.counts.matchingFilters).toBe(trail.results.length);
    });

    it('explains when no events match the filters', async () => {
      app = await buildTestApp();
      const body = await plan('?maxTravel=15&surface=trail');
      expect(body.results).toEqual([]);
      expect(body.message).toBe('No events match these filters.');
    });

    it('excludes visited events for the New Event goal', async () => {
      app = await buildTestApp();
      const body = await plan('?goal=new_event&maxTravel=90');
      expect(body.results.length).toBeGreaterThan(0);
      expect(body.results.every((r) => r.event.visited === false)).toBe(true);
    });

    it('reports Challenge as unavailable instead of inventing results', async () => {
      app = await buildTestApp();
      const body = await plan('?goal=challenge');
      expect(body.results).toEqual([]);
      expect(body.message).toMatch(/arrive once personal run history/);
    });

    it('rejects dates outside the planning horizon and unknown filter values', async () => {
      app = await buildTestApp();
      const past = await app.inject('/api/planner?date=2026-09-26');
      expect(past.statusCode).toBe(400);
      expect(past.json().error.message).toBe('Planning is available for the next 4 Saturdays only.');
      expect((await app.inject('/api/planner?surface=sand')).statusCode).toBe(400);
      expect((await app.inject('/api/planner?maxTravel=20')).statusCode).toBe(400);
    });

    it('accepts a later Saturday within the horizon', async () => {
      app = await buildTestApp();
      expect((await plan('?date=2026-10-24')).date).toBe('2026-10-24');
    });
  });

  describe('event history', () => {
    it('defaults to 90 days with medians and sample size', async () => {
      app = await buildTestApp();
      const body = (await app.inject('/api/events/demo-estuary-path-5k/history')).json<EventHistoryResponse>();
      expect(body.window).toBe('90');
      expect(body.from).toBe('2026-07-04');
      expect(body.summary.eventsHeld).toBe(12);
      expect(body.summary.cancelled).toBe(1);
      expect(body.summary.medianWinnerSeconds).toEqual(expect.any(Number));
      expect(body.coverage.totalOccurrences).toBe(26);
    });

    it('supports every window and grows monotonically', async () => {
      app = await buildTestApp();
      const counts = [];
      for (const w of ['30', '60', '90', '365', 'all']) {
        const res = await app.inject(`/api/events/demo-riverside-5k/history?window=${w}`);
        expect(res.statusCode).toBe(200);
        counts.push(res.json<EventHistoryResponse>().occurrences.length);
      }
      expect(counts).toEqual([...counts].sort((a, b) => a - b));
      expect(counts.at(-1)).toBe(26);
    });

    it('validates the window and the event', async () => {
      app = await buildTestApp();
      expect((await app.inject('/api/events/demo-riverside-5k/history?window=7')).statusCode).toBe(400);
      expect((await app.inject('/api/events/nope/history')).statusCode).toBe(404);
    });
  });

  describe('where could I place', () => {
    it('places a manual time historically, ranked by target frequency, with confidence', async () => {
      app = await buildTestApp();
      const body = (await app.inject('/api/placement?time=19:30')).json<PlacementResponse>();
      expect(body).toMatchObject({ timeSeconds: 1170, window: '90', target: 'top10', maxTravelMinutes: 45, from: '2026-07-04' });
      expect(body.results.length).toBeGreaterThan(0);
      for (const r of body.results) {
        expect(r.event.travel!.minutes).toBeLessThanOrEqual(45);
        expect(r.stats!.typicalRange.low).toBeLessThanOrEqual(r.stats!.typicalRange.high);
        expect(r.target!.of).toBe(r.sampleSize);
      }
      const estuary = body.results.find((r) => r.event.id === 'demo-estuary-path-5k')!;
      expect(estuary.excluded.cancelled).toBe(1);
      expect(estuary.sampleSize).toBe(12);
      expect(estuary.confidence).toBe('high');
      expect(body.notes.join(' ')).toMatch(/not predictions/);
    });

    it('accepts seconds and h:mm:ss, and rejects malformed times', async () => {
      app = await buildTestApp();
      const a = (await app.inject('/api/placement?time=1170')).json<PlacementResponse>();
      const b = (await app.inject('/api/placement?time=0:19:30')).json<PlacementResponse>();
      expect(a.results).toEqual(b.results);
      for (const bad of ['abc', '19:75', '5:00', '99999', '']) {
        const res = await app.inject(`/api/placement?time=${encodeURIComponent(bad)}`);
        expect(res.statusCode).toBe(400);
        expect(res.json().error.message).toMatch(/Enter a 5K time like 19:30/);
      }
      expect((await app.inject('/api/placement')).statusCode).toBe(400);
    });

    it('grows the sample with the window', async () => {
      app = await buildTestApp();
      const sizes = [];
      for (const w of ['30', '60', '90', '365', 'all']) {
        const body = (await app.inject(`/api/placement?time=22:00&window=${w}&maxTravel=90`)).json<PlacementResponse>();
        sizes.push(body.results.find((r) => r.event.id === 'demo-riverside-5k')!.sampleSize);
      }
      expect(sizes).toEqual([...sizes].sort((x, y) => x - y));
      expect(sizes.at(-1)).toBe(26);
      expect(sizes[0]).toBeLessThan(6);
    });

    it('serves a single event placement for the event page', async () => {
      app = await buildTestApp();
      const body = (await app.inject('/api/events/demo-riverside-5k/placement?time=1180')).json<EventPlacement>();
      expect(body.event.id).toBe('demo-riverside-5k');
      expect(body.stats?.medianPlacement).toEqual(expect.any(Number));
      expect((await app.inject('/api/events/nope/placement?time=1180')).statusCode).toBe(404);
    });
  });

  describe('PB finder', () => {
    it('ranks by stored PB Score and supports sorting and filters', async () => {
      app = await buildTestApp();
      const body = (await app.inject('/api/pb-finder')).json<PbFinderResponse>();
      expect(body.results[0]!.event.name).toBe('Riverside 5K');
      expect(body.notes[0]).toMatch(/demo values/);
      const byElevation = (await app.inject('/api/pb-finder?sort=elevation&maxTravel=90')).json<PbFinderResponse>();
      const elevations = byElevation.results.map((r) => r.event.elevationM!);
      expect(elevations).toEqual([...elevations].sort((a, b) => a - b));
      const notVisited = (await app.inject('/api/pb-finder?visited=not_visited&maxTravel=90')).json<PbFinderResponse>();
      expect(notVisited.results.every((r) => r.event.visited === false)).toBe(true);
      expect((await app.inject('/api/pb-finder?sort=fastest')).statusCode).toBe(400);
    });
  });

  describe('hidden gems', () => {
    it('returns a versioned, explained ranking with component breakdowns', async () => {
      app = await buildTestApp();
      const body = (await app.inject('/api/hidden-gems')).json<HiddenGemsResponse>();
      expect(body.algorithm).toBe('hidden_gem_v1');
      expect(body.timeSeconds).toBe(1180);
      expect(body.results.length).toBeGreaterThan(0);
      for (const g of body.results) {
        expect(g.components).toHaveLength(5);
        expect(g.components.every((c) => c.value >= 0 && c.value <= 100)).toBe(true);
      }
      const scores = body.results.map((g) => g.gemScore);
      expect(scores).toEqual([...scores].sort((a, b) => b - a));
      const again = (await app.inject('/api/hidden-gems')).json<HiddenGemsResponse>();
      expect(again.results).toEqual(body.results);
    });

    it('filters by mode', async () => {
      app = await buildTestApp();
      const body = (await app.inject('/api/hidden-gems?mode=not_visited&maxTravel=90')).json<HiddenGemsResponse>();
      expect(body.results.every((g) => g.event.visited === false)).toBe(true);
    });
  });

  describe('compare', () => {
    it('compares 2–4 events in order, reports missing ids, and adds historical placement', async () => {
      app = await buildTestApp();
      const body = (await app.inject('/api/compare?ids=demo-estuary-path-5k,demo-riverside-5k,nope&time=19:40')).json<CompareResponse>();
      expect(body.events.map((e) => e.event.id)).toEqual(['demo-estuary-path-5k', 'demo-riverside-5k']);
      expect(body.missing).toEqual(['nope']);
      expect(body.timeSeconds).toBe(1180);
      expect(body.events.every((e) => e.placement?.stats != null)).toBe(true);
      expect(body.best.travel).toEqual(['demo-riverside-5k']);
    });

    it('omits placement without a runner time', async () => {
      app = await buildTestApp();
      const body = (await app.inject('/api/compare?ids=demo-estuary-path-5k,demo-riverside-5k')).json<CompareResponse>();
      expect(body.events.every((e) => e.placement === null)).toBe(true);
      expect(body.best.median_placement).toBeUndefined();
    });

    it('enforces the 2–4 event limit', async () => {
      app = await buildTestApp();
      const one = await app.inject('/api/compare?ids=demo-riverside-5k');
      expect(one.statusCode).toBe(400);
      expect(one.json().error.message).toBe('Choose at least 2 events to compare.');
      const five = await app.inject('/api/compare?ids=a,b,c,d,e');
      expect(five.json().error.message).toBe('Compare up to 4 events at a time.');
      // Duplicates collapse before counting.
      expect((await app.inject('/api/compare?ids=demo-riverside-5k,demo-riverside-5k')).statusCode).toBe(400);
    });
  });

  it('serves the demo profile with current form separate from lifetime PB', async () => {
    app = await buildTestApp();
    const profile = (await app.inject('/api/profile')).json();
    expect(profile).toMatchObject({ isDemo: true, lifetimePbSeconds: 1138, current5kEstimateSeconds: 1180 });
    expect(profile.savedEventIds).toContain('demo-riverside-5k');
  });
});
