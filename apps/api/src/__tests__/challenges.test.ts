import { describe, expect, it } from 'vitest';
import { ALPHABET_LETTERS, CHALLENGES } from '../challenges/definitions';
import { evaluateChallenge, eventsMatching, helpsWith } from '../challenges/engine';
import { initialLetter } from '../challenges/initialLetters';
import { deriveVisits } from '../challenges/visits';
import type { PerformanceRecord } from '../repositories/DataStore';
import { makeEvent } from './helpers';

const AS_OF = '2026-10-01';
const ALPHABET = CHALLENGES.find((c) => c.id === 'alphabet')!;

let n = 0;
function perf(eventId: string | null, date: string, seconds = 1300, extra: Partial<PerformanceRecord> = {}): PerformanceRecord {
  return {
    id: `p${String(++n).padStart(4, '0')}`,
    userId: 'u',
    eventId,
    eventName: eventId,
    externalEventName: eventId == null ? 'Warrington 5K' : null,
    performanceType: eventId == null ? 'road_race' : 'parkrun',
    distanceMeters: 5000,
    date,
    finishTimeSeconds: seconds,
    source: 'manual',
    externalResultId: null,
    verified: false,
    ...extra,
  };
}
/** Pure derivation tests use explicitly trusted fixture identities; repository scope has separate integration tests. */
const fixtureVisits = (performances: PerformanceRecord[], today: string) => deriveVisits(performances, today,
  new Set(performances.flatMap((performance) => performance.eventId == null ? [] : [performance.eventId])));

/** An event whose id is also its name, e.g. "Ashton". */
const ev = (name: string, extra = {}) => makeEvent({ id: name, name, ...extra });

const evaluate = (performances: PerformanceRecord[], events = DATASET) => {
  const history = fixtureVisits(performances, AS_OF);
  return evaluateChallenge(ALPHABET, { asOfDate: AS_OF, visited: history.events, events });
};
const DATASET = ['Ashton', 'Bramley', 'Bolton Park', 'Cheadle', 'Delamere', 'Ashby Fields'].map((name) => ev(name));

describe('Visited events (derived from performances)', () => {
  it('derives count, first and latest visit and the event PB; repeat visits do not add events', () => {
    const h = fixtureVisits([perf('Ashton', '2026-03-07', 1320), perf('Ashton', '2026-01-10', 1290), perf('Ashton', '2026-05-02', 1305), perf('Bramley', '2026-02-14')], AS_OF);
    expect(h.events).toHaveLength(2);
    expect(h.events.find((e) => e.eventId === 'Ashton')).toEqual({ eventId: 'Ashton', eventName: 'Ashton', visitCount: 3, firstVisit: '2026-01-10', latestVisit: '2026-05-02', pbSeconds: 1290 });
    expect(h.visits.map((v) => v.date)).toEqual(['2026-01-10', '2026-02-14', '2026-03-07', '2026-05-02']);
    expect(h.events.map((e) => e.eventId)).toEqual(['Ashton', 'Bramley']); // most recently visited first
  });

  it('never counts an external race as a visited 5K Compass event', () => {
    const h = fixtureVisits([perf(null, '2026-04-04'), perf('Ashton', '2026-03-07')], AS_OF);
    expect(h.events.map((e) => e.eventId)).toEqual(['Ashton']);
    expect([h.totalRuns, h.externalRuns, h.visits.length]).toEqual([2, 1, 1]);
  });

  it('ignores performances dated after asOfDate', () => {
    expect(fixtureVisits([perf('Ashton', '2026-10-02')], AS_OF).events).toEqual([]);
  });
});

describe('Alphabet letter normalisation', () => {
  it.each([
    ['Ashton', 'A'],
    ['ashton', 'A'],
    ['  "Bramley" Park', 'B'],
    ['Église Park', 'E'],
    ['Ōtautahi', 'O'],
    ['(Cheadle) 5K', 'C'],
    ['5K Park', null],
    ['', null],
    ['Ørsted Park', null], // Ø has no A–Z decomposition: no letter rather than a guess
  ])('%s → %s', (name, letter) => expect(initialLetter(name)).toBe(letter));
});

describe('Alphabet Challenge (initial_letters)', () => {
  it('defines its required letters explicitly: A–Z without X (25)', () => {
    expect(ALPHABET).toMatchObject({ kind: 'initial_letters', name: 'Alphabet Challenge' });
    expect(ALPHABET_LETTERS).toHaveLength(25);
    expect(ALPHABET_LETTERS).not.toContain('X');
    expect(ALPHABET.rules.join(' ')).toMatch(/not an official parkrun challenge/);
  });

  it('is not started without visits', () => {
    const r = evaluate([perf(null, '2026-04-04')]);
    expect(r).toMatchObject({ status: 'not_started', progress: { current: 0, target: 25, percentage: 0 }, completedItems: [], completedOn: null });
  });

  it('marks completed and missing letters from visits only, never inventing one', () => {
    const r = evaluate([perf('Ashton', '2026-03-07'), perf('Cheadle', '2026-04-04'), perf('Cheadle', '2026-05-02')]);
    expect(r.status).toBe('in_progress');
    expect(r.completedItems).toEqual(['A', 'C']);
    expect(r.missingItems).toHaveLength(23);
    expect(r.missingItems).toContain('B');
    expect(r.items.find((i) => i.key === 'C')!.completedBy).toEqual({ eventId: 'Cheadle', eventName: 'Cheadle', date: '2026-04-04' });
    expect(r.items.find((i) => i.key === 'B')).toMatchObject({ completed: false, completedBy: null, qualifyingEvents: [] });
  });

  it('uses the earliest first visit when several events qualify, keeping all of them listed', () => {
    const r = evaluate([perf('Ashton', '2026-06-06'), perf('Ashby Fields', '2026-02-07'), perf('Ashton', '2026-01-03')]);
    const a = r.items.find((i) => i.key === 'A')!;
    expect(a.completedBy).toEqual({ eventId: 'Ashton', eventName: 'Ashton', date: '2026-01-03' });
    expect(a.qualifyingEvents.map((q) => [q.eventName, q.firstVisit])).toEqual([
      ['Ashton', '2026-01-03'],
      ['Ashby Fields', '2026-02-07'],
    ]);
    // Same first-visit date: the event name breaks the tie, so the choice never depends on input order.
    const tie = [perf('Ashton', '2026-01-03'), perf('Ashby Fields', '2026-01-03')];
    expect(evaluate(tie).items[0]!.completedBy!.eventName).toBe('Ashby Fields');
    expect(evaluate([...tie].reverse())).toEqual(evaluate(tie));
  });

  it('reports progress percentage: 18 of 25 is 72%', () => {
    const letters = ALPHABET_LETTERS.slice(0, 18);
    const events = letters.map((l) => ev(`${l}ville`));
    const r = evaluate(letters.map((l, i) => perf(`${l}ville`, `2026-0${1 + (i % 9)}-0${1 + (i % 7)}`)), events);
    expect(r.progress).toEqual({ current: 18, target: 25, percentage: 72 });
    expect(r.status).toBe('in_progress');
  });

  it('completes when every required letter is visited, dated by the last letter completed', () => {
    const events = ALPHABET_LETTERS.map((l) => ev(`${l}ville`));
    const runs = ALPHABET_LETTERS.map((l, i) => perf(`${l}ville`, `2026-${String(1 + (i % 9)).padStart(2, '0')}-${String(1 + i).padStart(2, '0')}`));
    const r = evaluate(runs, events);
    expect(r).toMatchObject({ status: 'completed', progress: { current: 25, target: 25, percentage: 100 }, missingItems: [] });
    expect(r.completedOn).toBe([...runs.map((p) => p.date)].sort().at(-1));
  });

  it('lists dataset events that would complete each missing letter (descriptive, by name)', () => {
    const r = evaluate([perf('Ashton', '2026-03-07')]);
    expect(r.items.find((i) => i.key === 'B')!.opportunities.map((o) => o.eventName)).toEqual(['Bolton Park', 'Bramley']);
    expect(r.items.find((i) => i.key === 'A')!.opportunities).toEqual([]); // completed: nothing to find
    expect(r.items.find((i) => i.key === 'Z')!.opportunities).toEqual([]); // honestly empty
    expect(eventsMatching(ALPHABET, 'B', DATASET).map((e) => e.name)).toEqual(['Bramley', 'Bolton Park']);
    expect(eventsMatching(ALPHABET, 'X', DATASET)).toEqual([]); // not a required letter
  });

  it('says which missing letters a visit to an event would complete', () => {
    const r = evaluate([perf('Ashton', '2026-03-07')]);
    expect(helpsWith(ev('Bramley'), [r])).toEqual([{ challengeId: 'alphabet', challengeName: 'Alphabet Challenge', itemKey: 'B', itemLabel: 'B' }]);
    expect(helpsWith(ev('Ashby Fields'), [r])).toEqual([]); // A is already done
  });
});
