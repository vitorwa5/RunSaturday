/**
 * Saturday orchestrator (Phase 5B): one deterministic fixture world per concern. Events sit due
 * north of the origin, so `km` controls estimated travel; every other input is explicit.
 */
import { DEFAULT_PLANNER_FILTERS, type EventSummary, type Goal, type OccurrenceSummary, type PlannerFilters, type RunnerForm } from '@runsaturday/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DataStore, EventRecord, PerformanceRecord, UserRecord } from '../repositories/DataStore';
import { MemoryDataStore } from '../repositories/memory/MemoryDataStore';
import { orchestrateSaturday, stableHash, type SaturdayRequest } from '../saturday/orchestrator';
import { computeAdjustedPlacements } from '../services/placementService';
import { rankingContext } from '../services/rankingContext';
import { rankHiddenGems } from '../services/hiddenGemService';
import { loadUser } from '../services/userPerformance';
import { makeEvent } from './helpers';

const TODAY = '2026-10-01';
const SATURDAY = '2026-10-03';
const ORIGIN = { latitude: 53.4, longitude: -2.6 };

/** An event `km` north of the origin (≈ travel) with explicit scores. */
function ev(id: string, km: number, extra: Partial<EventSummary> = {}, scores: Partial<NonNullable<EventSummary['scores']>> = {}): EventRecord {
  const base = makeEvent({ id, name: id, latitude: ORIGIN.latitude + km / 111.2, longitude: ORIGIN.longitude, ...extra });
  const { travel: _t, visited: _v, favourite: _f, ...record } = base;
  return { ...record, scores: base.scores ? { ...base.scores, ...scores } : null };
}

let n = 0;
const run = (eventId: string, date = '2026-06-06'): PerformanceRecord => ({
  id: `p${++n}`,
  userId: 'u',
  eventId,
  eventName: eventId,
  externalEventName: null,
  performanceType: 'parkrun',
  distanceMeters: 5000,
  date,
  finishTimeSeconds: 1300,
  source: 'manual',
  externalResultId: null,
  verified: false,
});

const NO_FORM = { status: 'unavailable', formSeconds: null, confidence: { level: 'insufficient', score: 0, factors: [] } } as unknown as RunnerForm;

/** A fixture store and a user whose visits are derived from `performances`, as loadUser does. */
function world(events: EventRecord[], o: { performances?: PerformanceRecord[]; occurrences?: Record<string, OccurrenceSummary[]>; favourites?: string[]; form?: RunnerForm } = {}) {
  const performances = o.performances ?? [];
  const store = {
    listActiveEvents: async () => events,
    // All references in this synthetic strategy fixture are trusted, including historical ones.
    listTrustedEventIds: async (ids: string[]) => ids,
    listUserPerformances: async () => performances,
    listOccurrences: async (id: string) => o.occurrences?.[id] ?? [],
    listCourseFactors: async () => [],
    listPlacementInputs: async () => [],
  } as unknown as DataStore;
  const visited = new Set(performances.map((p) => p.eventId));
  const user = {
    id: 'u',
    favouriteEventIds: o.favourites ?? [],
    currentForm: o.form ?? NO_FORM,
    events: events.map((e) => ({ eventId: e.id, visited: visited.has(e.id), favourite: (o.favourites ?? []).includes(e.id), visitCount: 0, personalBestSeconds: null })),
  } as unknown as UserRecord;
  const ask = (intent: Goal, extra: Partial<SaturdayRequest> = {}) =>
    orchestrateSaturday(store, user, { intent, date: SATURDAY, today: TODAY, maxTravelMinutes: 60, filters: DEFAULT_PLANNER_FILTERS, origin: ORIGIN, ...extra });
  return { store, user, ask };
}

const ids = (r: { results: { event: { id: string } }[] }) => r.results.map((x) => x.event.id);
const filters = (f: Partial<PlannerFilters>): PlannerFilters => ({ ...DEFAULT_PLANNER_FILTERS, ...f });

/** `count` weekly completed occurrences ending on TODAY's Saturday, with these field sizes. */
function weeks(sizes: number[]): OccurrenceSummary[] {
  return sizes.map((participantCount, i) => ({
    date: new Date(Date.UTC(2026, 8, 26) - 7 * i * 86_400_000).toISOString().slice(0, 10),
    status: 'completed',
    participantCount,
    winnerTimeSeconds: 1000,
    thirdTimeSeconds: 1050,
    fifthTimeSeconds: 1080,
    tenthTimeSeconds: 1150,
  }));
}

afterEach(() => vi.restoreAllMocks());

describe('Run faster', () => {
  const fast = ev('fast', 10, { elevationM: 10 }, { pbScore: 91, courseSpeedFactor: 0.97, pbConfidence: 'high' });
  const slow = ev('slow', 5, { elevationM: 90 }, { pbScore: 55, courseSpeedFactor: 1.04, pbConfidence: 'high' });
  const middle = ev('middle', 8, {}, { pbScore: 70, courseSpeedFactor: 1.0, pbConfidence: 'medium' });

  it('ranks the faster, course-suitable event above a slower course and explains it', async () => {
    const r = await world([slow, middle, fast]).ask('pb');
    expect(ids(r)).toEqual(['fast', 'middle', 'slow']);
    expect(r.bestPick!.why).toContain('Historically one of the faster courses in the analysed cohort');
    expect(r.bestPick!.why).toContain('Strong PB Score (91/100)');
    expect(r.bestPick!.why!.length).toBeGreaterThanOrEqual(2);
    expect(r.bestPick!.why!.length).toBeLessThanOrEqual(4);
    expect(r.bestPick!.dataConfidence).toEqual({ level: 'high', label: 'High data confidence', basis: 'Course speed from runners who ran here and elsewhere' });
    expect(r.bestPick!.why!.join(' ')).not.toMatch(/you will|PB guaranteed|predict/i);
  });

  it('shows the Current Form equivalent only when Current Form exists, and says so when it does not', async () => {
    const without = await world([fast]).ask('pb');
    expect(without.bestPick!.why!.join(' ')).not.toMatch(/Current Form/);
    expect(without.limitations).toContain('Current Form unavailable: the course ranking is unchanged, but no Current Form equivalents are shown.');
    const form = { status: 'estimate', formSeconds: 1200, version: 'runner_form_v1', confidence: { level: 'high', score: 90, factors: [] } } as unknown as RunnerForm;
    const withForm = await world([fast], { form }).ask('pb');
    expect(withForm.bestPick!.why).toContain('Your Current Form ≈ 20:00 equates to ≈ 19:24 here'); // 1200 × 0.97
    expect(withForm.limitations).toEqual([]);
  });

  it('ranks a missing course factor / limited-data event last, labelled as limited data', async () => {
    const unknown = ev('unknown', 3, {}, { pbScore: 99, courseSpeedFactor: null, pbConfidence: 'insufficient' });
    const r = await world([unknown, middle]).ask('pb');
    expect(ids(r)).toEqual(['middle', 'unknown']);
    expect(r.results[1]!.dataConfidence).toMatchObject({ level: 'insufficient', label: 'Limited data' });
    const noScores = ev('no-scores', 3);
    const r2 = await world([{ ...noScores, scores: null }, middle]).ask('pb');
    expect(ids(r2)).toEqual(['middle']); // no PB Score at all: cannot be ranked for this intent
  });
});

describe('Finish higher (Current Form → placement engine)', () => {
  it('orders events by the placement engine, using Current Form converted to each course', async () => {
    const store = new MemoryDataStore(TODAY);
    const user = (await loadUser(store, 'demo-user', TODAY))!;
    const r = await orchestrateSaturday(store, user, { intent: 'place', date: SATURDAY, today: TODAY, maxTravelMinutes: 90, filters: DEFAULT_PLANNER_FILTERS, origin: { latitude: user.homeLat!, longitude: user.homeLon! } });
    const ctx = await rankingContext(store, user, 'place', r.results.map((x) => x.event), { maxTravelMinutes: 90, today: TODAY });
    const share = (id: string) => {
      const p = ctx.place!.get(id)!;
      return p.frequency.count / p.frequency.of;
    };
    const reliable = r.results.filter((x) => !ctx.place!.get(x.event.id)!.limited).map((x) => share(x.event.id));
    expect(reliable).toEqual([...reliable].sort((a, b) => b - a));
    expect(r.ability.usesCurrentForm).toBe(true);
    expect(r.bestPick!.why![0]).toMatch(/^Historically, your Current Form would have placed in the top 10 at \d+ of the last \d+ analysed events$/);
    expect(r.bestPick!.dataConfidence!.basis).toBe('Placement history and course adjustment');
    // The same engine, unchanged: the placement service agrees on the converted time.
    const { placements } = await computeAdjustedPlacements(store, [r.bestPick!.event], { window: '90', target: 'top10', today: TODAY, form: ctx.form!, factors: new Map((await store.listCourseFactors()).map((f) => [f.eventId, f])) });
    expect(placements[0]!.analysedSeconds).toBe(ctx.place!.get(r.bestPick!.event.id)!.equivalentSeconds);
  });

  it('falls back to lowest Competition Score, labelled, when Current Form is unavailable', async () => {
    const r = await world([ev('hard', 5, {}, { competitionScore: 80 }), ev('easy', 6, {}, { competitionScore: 40 })]).ask('place');
    expect(ids(r)).toEqual(['easy', 'hard']);
    expect(r.method).toMatch(/Current Form unavailable/);
    expect(r.limitations[0]).toMatch(/^Current Form unavailable: ranked by lowest Competition Score instead/);
    expect(r.ability.usesCurrentForm).toBe(false);
  });
});

describe('Visit somewhere new', () => {
  const events = [ev('home', 3), ev('near', 8), ev('far', 20), ev('loved', 25)];
  const w = world(events, { performances: [run('home'), run('home', '2026-07-04')], favourites: ['home', 'loved'] });

  it('excludes visited events (even favourites) and ranks the rest nearest first', async () => {
    const r = await w.ask('new_event');
    expect(ids(r)).toEqual(['near', 'far', 'loved']);
    expect(r.defaultsApplied).toEqual(['Only events you have not visited']);
    expect(r.results.every((x) => x.why![0] === 'New to you')).toBe(true);
    expect(r.results.find((x) => x.event.id === 'loved')!.why).toContain('Favourite');
    expect(r.bestPick!.dataConfidence).toBeNull(); // rests on the runner's own history
  });

  it('reports a conflicting Visited filter instead of silently ignoring it', async () => {
    const r = await w.ask('new_event', { filters: filters({ visited: 'visited' }) });
    expect(r.results).toEqual([]);
    expect(r.message).toMatch(/only shows events you have not visited, but the Visited filter keeps only events you have/);
  });
});

describe('Complete a challenge', () => {
  // Visited: Ashton (A). Missing letters with events: B (Bolton, Bramley), C (Cheadle).
  const events = [ev('Ashton', 5), ev('Bramley', 20), ev('Bolton', 10), ev('Cheadle', 15), ev('Zed Far', 200)];
  const w = world(events, { performances: [run('Ashton')] });

  it('lists only events that complete the chosen missing item, nearest first', async () => {
    const r = await w.ask('challenge', { challenge: { id: 'alphabet', item: 'B' } });
    expect(ids(r)).toEqual(['Bolton', 'Bramley']);
    expect(r.bestPick!.why!.slice(0, 2)).toEqual(['Completes Alphabet — B', 'New to you']);
    expect(r.bestPick!.why![2]).toMatch(/^Shorter travel \(about \d+ min, estimated\)$/);
    expect(r.challenge).toMatchObject({ challengeId: 'alphabet', challengeName: 'Alphabet Challenge', itemKey: 'B', progress: { current: 1, target: 25 } });
    expect(r.challenge!.missingItems.find((i) => i.key === 'B')).toEqual({ key: 'B', label: 'B', opportunities: 2 });
  });

  it('without an item, lists events for any missing item; with one challenge the flow needs no choice', async () => {
    const r = await w.ask('challenge');
    expect(ids(r)).toEqual(['Bolton', 'Cheadle', 'Bramley']);
    expect(r.challenge!.itemKey).toBeNull();
    expect(r.challenge!.challenges).toEqual([{ id: 'alphabet', name: 'Alphabet Challenge', status: 'in_progress' }]);
  });

  it('says so when no event in the dataset completes the item, and never fabricates one', async () => {
    const r = await w.ask('challenge', { challenge: { id: 'alphabet', item: 'Q' } });
    expect(r.results).toEqual([]);
    expect(r.message).toBe('No event in the current 5K Compass dataset completes Q. More events may be added later.');
  });

  it('explains matching events beyond the travel limit, and completed or unknown items', async () => {
    const r = await w.ask('challenge', { challenge: { id: 'alphabet', item: 'Z' } });
    expect(r.results).toEqual([]);
    expect(r.exclusions).toEqual(['1 matching event is beyond 60 min or outside your filters.']);
    expect((await w.ask('challenge', { challenge: { id: 'alphabet', item: 'A' } })).message).toBe('You have already completed A.');
    expect((await w.ask('challenge', { challenge: { id: 'alphabet', item: 'X' } })).message).toBe('X is not part of the Alphabet Challenge.');
  });
});

describe('Quiet event', () => {
  it('ranks a reliably smaller field above a larger one, by median not one anomalous week', async () => {
    const occurrences = {
      // Usually ~300, one odd week of 20: still a big event.
      usuallyBig: weeks([300, 310, 20, 295, 305, 290, 300, 315]),
      reliablySmall: weeks([120, 115, 125, 118, 130, 122, 119, 121]),
      // Tiny but only three events: less certain, so after the reliable ones.
      fewEvents: weeks([40, 45, 50]),
    };
    const r = await world([ev('usuallyBig', 5), ev('reliablySmall', 10), ev('fewEvents', 7), ev('noData', 6)], { occurrences }).ask('quiet');
    expect(ids(r)).toEqual(['reliablySmall', 'usuallyBig', 'fewEvents']);
    expect(r.bestPick!.why![0]).toBe('Typically around 121 runners (median of 8 events, last 90 days)');
    expect(r.bestPick!.rankedBy).toMatchObject({ key: 'typical_participants', value: 121 });
    expect(r.results[1]!.rankedBy.value).toBe(300);
    expect(r.results[2]!.why).toContain('Only 3 recent events: field size less certain');
    expect(r.results[2]!.dataConfidence!.level).toBe('low');
    expect(r.exclusions).toEqual(['1 event has no field sizes in the last 90 days.']);
    expect(r.limitations).toContain('Field sizes are historical; attendance on Saturday can differ.');
  });
});

describe('Hidden gem', () => {
  it('returns exactly the Hidden Gem V1 ordering and scores', async () => {
    const events = [
      ev('big', 5, { averageParticipants: 420 }, { competitionScore: 85 }),
      ev('gem', 25, { averageParticipants: 70 }, { competitionScore: 30 }),
      ev('mid', 12, { averageParticipants: 180 }, { competitionScore: 55, pbConfidence: 'low' }),
    ];
    const w = world(events, { performances: [run('big')] });
    const r = await w.ask('hidden_gem');
    const contextEvents = (await w.ask('surprise')).results.map((x) => x.event); // same events with visit/travel context
    const v1 = rankHiddenGems(contextEvents, { mode: 'all', maxTravelMinutes: 60, timeSeconds: null, top10ByEvent: new Map() });
    expect(r.results.map((x) => [x.event.id, x.rankedBy.value])).toEqual(v1.map((g) => [g.event.id, g.gemScore]));
    expect(r.bestPick!.event.id).toBe('gem');
    expect(r.bestPick!.why!.length).toBeGreaterThanOrEqual(2);
  });
});

describe('Surprise me (deterministic)', () => {
  const events = [
    ev('Trail Woods', 12, { surface: 'trail' }, { pbConfidence: 'high' }),
    ev('Cheadle', 15, {}, { pbConfidence: 'high' }),
    ev('Beach', 20, { surface: 'grass', averageParticipants: 60 }, { pbConfidence: 'medium', competitionScore: 30 }),
    ev('Home Park', 4, {}, { pbConfidence: 'high' }),
    ev('Unreliable', 6, { surface: 'trail', averageParticipants: 40 }, { pbConfidence: 'insufficient' }),
  ];
  const w = world(events, { performances: [run('Home Park')] });

  it('gives the same answer for the same user, Saturday and offset, and never uses Math.random', async () => {
    const random = vi.spyOn(Math, 'random');
    const a = await w.ask('surprise');
    const b = await w.ask('surprise');
    expect(ids(a)).toEqual(ids(b));
    expect(random).not.toHaveBeenCalled();
    expect(a.surprise!.offset).toBe(0);
  });

  it('rotates through a shortlist of strong options (by Saturday and "show me another"), never a limited-data event', async () => {
    const first = await w.ask('surprise');
    const shortlist = first.surprise!.shortlist;
    expect(shortlist).toBeGreaterThan(1);
    const picks = new Set<string>();
    for (let offset = 0; offset < shortlist; offset++) picks.add((await w.ask('surprise', { offset })).bestPick!.event.id);
    expect(picks.size).toBe(shortlist); // every shortlisted option gets its turn
    expect(picks.has('Unreliable')).toBe(false);
    expect(picks.has('Home Park')).toBe(false); // visited and nothing else interesting: not shortlisted
    // Different Saturdays start at different points of the same shortlist (stable hash).
    expect(stableHash('u|2026-10-03') % shortlist).not.toBe(stableHash('u|2026-10-10') % shortlist);
  });

  it('explains every pick with its interest signals', async () => {
    const r = await w.ask('surprise');
    expect(r.bestPick!.why!.length).toBeGreaterThanOrEqual(2);
    expect(r.bestPick!.rankedBy).toMatchObject({ key: 'interest_signals', outOf: 5 });
    // The signal count is the number of interest signals listed first in the reasons.
    const signals = r.bestPick!.reasons.slice(0, r.bestPick!.rankedBy.value!).map((x) => x.text);
    expect(signals.length).toBeGreaterThanOrEqual(1);
    expect(r.bestPick!.why![0]).toBe(signals[0]);
  });
});

describe('Constraints, fallbacks and empty states', () => {
  const events = [ev('Ashton', 5, { surface: 'trail' }), ev('Bolton', 10, { surface: 'tarmac' }), ev('Bramley', 70, { surface: 'trail' })];
  const w = world(events);

  it('applies the travel limit to every intent', async () => {
    for (const intent of ['pb', 'new_event', 'challenge', 'hidden_gem', 'surprise'] as const) {
      const r = await w.ask(intent, { maxTravelMinutes: 30 });
      expect(ids(r)).not.toContain('Bramley');
    }
  });

  it('keeps compatible filters when the intent changes (same request, another intent)', async () => {
    const trail = filters({ surface: 'trail' });
    for (const intent of ['pb', 'new_event', 'challenge', 'surprise'] as const) {
      const r = await w.ask(intent, { filters: trail, maxTravelMinutes: 90 });
      expect(r.results.every((x) => x.event.surface === 'trail')).toBe(true);
    }
  });

  it('says why there is nothing to show', async () => {
    expect((await w.ask('pb', { maxTravelMinutes: 1 })).message).toBe('No events within 1 minutes. Try a longer travel limit.');
    expect((await w.ask('pb', { filters: filters({ surface: 'grass' }) })).message).toBe('No events match these filters.');
    expect((await w.ask('pb', { origin: null })).message).toBe('Choose a starting point to see events near you.');
    const empty = await w.ask('quiet');
    expect([empty.results, empty.message]).toEqual([[], 'No events suit this goal with the current settings.']);
  });

  it('always returns a best match plus up to three alternatives, from the same ranked list', async () => {
    const many = world(Array.from({ length: 6 }, (_, i) => ev(`E${i}`, 5 + i)));
    const r = await many.ask('new_event');
    expect(r.bestPick).toEqual(r.results[0]);
    expect(r.alternatives).toEqual(r.results.slice(1, 4));
  });
});
