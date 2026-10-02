import { afterEach, describe, expect, it } from 'vitest';
import type {
  BestPickResponse,
  CompareResponse,
  EventAnalyticsResponse,
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
    // Fastest observed course (PB Score V1) within the demo user's travel limit.
    expect(body.pick?.event.name).toBe('Dockside Promenade 5K');
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
      expect(body.results[0]!.event.name).toBe('Dockside Promenade 5K');
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

    it('reports a placing range where demo runners share the target time', async () => {
      app = await buildTestApp();
      // 28:00 sits in the dense middle of the Riverside field, where results share seconds.
      const body = (await app.inject('/api/events/demo-riverside-5k/placement?time=28:00&window=all')).json<EventPlacement>();
      const tied = body.history.filter((h) => h.worst > h.best);
      expect(tied.length).toBeGreaterThan(0);
      expect(body.stats!.medianPlacement.high).toBeGreaterThanOrEqual(body.stats!.medianPlacement.low);
    });

    it('serves a single event placement for the event page', async () => {
      app = await buildTestApp();
      const body = (await app.inject('/api/events/demo-riverside-5k/placement?time=1180')).json<EventPlacement>();
      expect(body.event.id).toBe('demo-riverside-5k');
      expect(body.stats?.medianPlacement).toEqual({ low: expect.any(Number), high: expect.any(Number) });
      for (const h of body.history) expect(h.worst).toBeGreaterThanOrEqual(h.best);
      expect((await app.inject('/api/events/nope/placement?time=1180')).statusCode).toBe(404);
    });

    it('course-adjusts a time achieved at a source event and feeds the equivalent to the placement engine', async () => {
      app = await buildTestApp();
      const q = '/api/placement?time=19:35&maxTravel=90&window=all';
      const adjusted = (await app.inject(`${q}&source=demo-riverside-5k`)).json<PlacementResponse>();
      const raw = (await app.inject(`${q}&source=demo-riverside-5k&mode=raw`)).json<PlacementResponse>();
      expect(adjusted.mode).toBe('adjusted');
      expect(adjusted.source).toMatchObject({ eventId: 'demo-riverside-5k', name: 'Riverside 5K', confidence: 'high' });
      expect(adjusted.notes[0]).toMatch(/not predicted finish times/);
      expect(raw.mode).toBe('raw');
      expect(raw.results.every((r) => r.adjustment == null && r.analysedSeconds === 1175)).toBe(true);

      const at = (body: PlacementResponse, id: string) => body.results.find((r) => r.event.id === id)!;
      // Same course: unchanged. Hilly forest trail: a clearly slower equivalent, placed further back.
      expect(at(adjusted, 'demo-riverside-5k').analysedSeconds).toBe(1175);
      const forest = at(adjusted, 'demo-forest-trail-5k');
      expect(forest.adjustment).toMatchObject({ available: true, sourceEventId: 'demo-riverside-5k', sourceSeconds: 1175 });
      expect(forest.analysedSeconds).toBe(forest.adjustment!.equivalentSeconds);
      expect(forest.analysedSeconds).toBeGreaterThan(1175 * 1.05);
      expect(forest.adjustment!.deltaSeconds).toBe(forest.analysedSeconds - 1175);
      expect(forest.adjustment!.conversionRange!.lowSeconds).toBeLessThanOrEqual(forest.analysedSeconds);
      expect(forest.stats!.medianPlacement.low).toBeGreaterThan(at(raw, 'demo-forest-trail-5k').stats!.medianPlacement.high);
    });

    it('falls back to raw time in auto mode only with a note, and never silently when adjustment is requested', async () => {
      app = await buildTestApp();
      const noSource = (await app.inject('/api/placement?time=19:35')).json<PlacementResponse>();
      expect(noSource).toMatchObject({ mode: 'raw', source: null, unavailable: [] });
      // An event-less time (current form) is labelled as a raw comparison, never presented as adjusted.
      expect(noSource.modeNote).toMatch(/^Raw time comparison — course adjustment unavailable: no source event/);
      const explicitRaw = (await app.inject('/api/placement?time=19:35&mode=raw&source=demo-riverside-5k')).json<PlacementResponse>();
      expect(explicitRaw).toMatchObject({ mode: 'raw', modeNote: null });
      const required = await app.inject('/api/placement?time=19:35&mode=adjusted');
      expect(required.statusCode).toBe(400);
      expect(required.json().error.message).toMatch(/where the time was achieved/);
      expect((await app.inject('/api/placement?time=19:35&source=nope')).statusCode).toBe(404);
    });

    it('labels an auto fallback for an unreliable source, and refuses silently placing raw times in adjusted mode', async () => {
      const memory = new MemoryDataStore('2026-10-01');
      const weakRiverside = Object.create(memory) as MemoryDataStore;
      weakRiverside.listCourseFactors = async () =>
        (await memory.listCourseFactors()).map((f) => (f.eventId === 'demo-riverside-5k' ? { ...f, confidence: { ...f.confidence, level: 'low' as const } } : f));
      app = await buildTestApp(weakRiverside);
      const auto = (await app.inject('/api/placement?time=19:35&source=demo-riverside-5k')).json<PlacementResponse>();
      expect(auto.mode).toBe('raw');
      expect(auto.modeNote).toBe('Raw time comparison — course adjustment unavailable: limited matched-runner data at Riverside 5K.');
      expect(auto.results.every((r) => r.adjustment == null)).toBe(true);
      const adjusted = (await app.inject('/api/placement?time=19:35&source=demo-riverside-5k&mode=adjusted')).json<PlacementResponse>();
      expect(adjusted).toMatchObject({ mode: 'adjusted', results: [] });
      expect(adjusted.modeNote).toMatch(/Course adjustment unavailable/);
    });

    it('serves an equivalent time for the event page outlook', async () => {
      app = await buildTestApp();
      const body = (await app.inject('/api/events/demo-moorland-edge-5k/placement?time=19:32&source=demo-riverside-5k')).json<EventPlacement>();
      expect(body.adjustment).toMatchObject({ available: true, sourceEventName: 'Riverside 5K', targetEventId: 'demo-moorland-edge-5k' });
      expect(body.analysedSeconds).toBeGreaterThan(1172);
      const raw = (await app.inject('/api/events/demo-moorland-edge-5k/placement?time=19:32')).json<EventPlacement>();
      expect(raw).toMatchObject({ analysedSeconds: 1172, adjustment: null });
    });
  });

  describe('PB finder', () => {
    it('ranks by stored PB Score and supports sorting and filters', async () => {
      app = await buildTestApp();
      const body = (await app.inject('/api/pb-finder')).json<PbFinderResponse>();
      expect(body.results[0]!.event.name).toBe('Dockside Promenade 5K');
      expect(body.notes[0]).toMatch(/PB Score V1/);
      expect(body.notes.join(' ')).not.toMatch(/demo values/);
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
      expect(body.timeSeconds).toBe(1202); // Current Form, converted to each course
      expect(body.notes.join(' ')).toMatch(/your Current Form, converted to each course/);
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

    it('compares course-adjusted equivalents when a source event is given', async () => {
      app = await buildTestApp();
      const body = (await app.inject('/api/compare?ids=demo-riverside-5k,demo-forest-trail-5k&time=19:32&source=demo-riverside-5k')).json<CompareResponse>();
      expect(body).toMatchObject({ mode: 'adjusted', source: { eventId: 'demo-riverside-5k', name: 'Riverside 5K' } });
      const [riverside, forest] = body.events;
      expect(riverside!.placement!.analysedSeconds).toBe(1172);
      expect(forest!.placement!.analysedSeconds).toBeGreaterThan(1172);
      expect(body.best.course_speed).toEqual(['demo-riverside-5k']);
      const raw = (await app.inject('/api/compare?ids=demo-riverside-5k,demo-forest-trail-5k&time=19:32')).json<CompareResponse>();
      expect(raw.mode).toBe('raw');
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

  describe('core analytics', () => {
    it('serves calculated Competition V1, Difficulty V1, Course Speed V1 and PB Score V1', async () => {
      app = await buildTestApp();
      const events = (await app.inject('/api/events')).json<EventSummary[]>();
      for (const e of events) {
        expect(e.scores!.versions).toEqual({ pb: 'pb_v1', competition: 'competition_v1', difficulty: 'difficulty_v1', courseSpeed: 'course_speed_v1' });
        expect(e.scores!.pbScore).toBeGreaterThanOrEqual(0);
        expect(e.scores!.pbScore).toBeLessThanOrEqual(100);
        expect(e.scores!.difficultyScore).toBeGreaterThanOrEqual(1);
        expect(e.scores!.difficultyScore).toBeLessThanOrEqual(10);
      }
      const byId = new Map(events.map((e) => [e.id, e.scores!]));
      // Deterministic demo values: deepest field highest, slowest field lowest; flattest course easiest.
      const comp = [...byId].sort((a, b) => b[1].competitionScore! - a[1].competitionScore!).map(([id]) => id);
      expect(comp[0]).toBe('demo-lakeside-5k');
      expect(comp.at(-1)).toBe('demo-moorland-edge-5k');
      expect(byId.get('demo-forest-trail-5k')!.difficultyScore).toBe(6.9);
      expect(byId.get('demo-dockside-promenade-5k')!.difficultyScore).toBe(1.8);
      expect(byId.get('demo-riverside-5k')!.competitionConfidence).toBe('high');
    });

    it('explains both scores with components, versions and confidence factors', async () => {
      app = await buildTestApp();
      const body = (await app.inject('/api/events/demo-victoria-park-5k/analytics')).json<EventAnalyticsResponse>();
      expect(body.window).toBe('90');
      const c = body.competition!;
      expect(c).toMatchObject({ metric: 'competition', version: 'competition_v1', windowDays: 90, asOfDate: '2026-10-01', sampleSize: 13, cohortSize: 10 });
      expect(c.components.map((x) => x.label)).toEqual(['Winner strength', 'Podium depth', 'Top-5 depth', 'Top-10 depth', 'Field depth']);
      expect(c.confidence.factors.map((f) => f.key)).toEqual(['amount', 'recency', 'completeness', 'stability']);
      const d = body.difficulty!;
      expect(d).toMatchObject({ metric: 'difficulty', version: 'difficulty_v1', value: 4.9 });
      expect(d.components.map((x) => x.input)).toEqual(['54 m', 'Mixed', '3+ laps']);
      expect(body.notes.join(' ')).toMatch(/not an official or universal parkrun rating/);
      const speed = body.courseSpeed!;
      expect(speed).toMatchObject({ metric: 'course_speed', version: 'course_speed_v1', windowDays: 365, limitedReason: null });
      expect(speed.factor).toBeGreaterThan(0.9);
      expect(speed.matchedRunners).toBeGreaterThanOrEqual(20);
      expect(speed.confidence.factors.map((f) => f.key)).toEqual(['matched_runners', 'comparisons', 'connectivity', 'proximity', 'agreement', 'recency']);
      expect(body.pb!.components.map((x) => [x.key, x.weight])).toEqual([
        ['course_speed', 0.75],
        ['structural', 0.25],
      ]);
      expect(body.notes.join(' ')).toMatch(/Competition is never part of it/);
    });

    it('supports every window and 404s unknown events', async () => {
      app = await buildTestApp();
      const sizes: number[] = [];
      for (const w of ['30', '60', '90', '365', 'all']) {
        const body = (await app.inject(`/api/events/demo-riverside-5k/analytics?window=${w}`)).json<EventAnalyticsResponse>();
        sizes.push(body.competition!.sampleSize);
        expect(body.competition!.windowDays).toBe(w === 'all' ? 0 : Number(w));
      }
      expect(sizes).toEqual([...sizes].sort((a, b) => a - b));
      expect((await app.inject('/api/events/nope/analytics')).statusCode).toBe(404);
      expect((await app.inject('/api/events/demo-riverside-5k/analytics?window=7')).statusCode).toBe(400);
    });

    it('uses Competition V1 in the Hidden Gem fallback while keeping hidden_gem_v1', async () => {
      app = await buildTestApp();
      const gems = (await app.inject('/api/hidden-gems?time=50:00&maxTravel=90')).json<HiddenGemsResponse>();
      expect(gems.algorithm).toBe('hidden_gem_v1');
      const events = new Map((await app.inject('/api/events')).json<EventSummary[]>().map((e) => [e.id, e]));
      for (const g of gems.results) {
        const placement = g.components.find((c) => c.key === 'placement_opportunity')!;
        if (placement.basis.startsWith('Inverse')) expect(placement.value).toBe(100 - events.get(g.event.id)!.scores!.competitionScore!);
      }
    });
  });

  it('serves the demo profile with current form separate from lifetime PB', async () => {
    app = await buildTestApp();
    const profile = (await app.inject('/api/profile')).json();
    // Current Form is modelled (course-adjusted) and separate from the Overall 5K PB.
    expect(profile).toMatchObject({ isDemo: true, lifetimePbSeconds: 1138, current5kEstimateSeconds: 1202, currentFormGapToOverallPbSeconds: 64 });
    expect(profile.currentForm).toMatchObject({ version: 'runner_form_v1', status: 'estimate', formSeconds: 1202, distanceMeters: 5000 });
    expect(profile.recentPbEvent).toEqual({ id: 'demo-riverside-5k', name: 'Riverside 5K' });
    expect(profile.lifetimePbEvent).toEqual({ id: 'demo-riverside-5k', name: 'Riverside 5K' });
    expect(profile.savedEventIds).toContain('demo-riverside-5k');
  });
});
