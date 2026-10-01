import { describe, expect, it } from 'vitest';
import { bestPick } from '../services/recommendations';
import { makeEvent } from './helpers';

const opts = { date: '2026-10-03', maxTravelMinutes: 45 };

describe('bestPick (Phase 1 placeholder ranking)', () => {
  it('ranks PB goal by PB Score, highest first, and explains the metric', () => {
    const events = [
      makeEvent({ id: 'a', scores: { ...makeEvent({ id: 'x' }).scores!, pbScore: 70 } }),
      makeEvent({ id: 'b', scores: { ...makeEvent({ id: 'x' }).scores!, pbScore: 91 } }),
    ];
    const res = bestPick('pb', events, opts);
    expect(res.pick?.event.id).toBe('b');
    expect(res.pick?.rankedBy).toEqual({ label: 'PB Score', value: 91 });
    expect(res.pick?.reasons.map((r) => r.text)).toContain('PB Score 91/100');
    expect(res.alternatives.map((r) => r.event.id)).toEqual(['a']);
  });

  it('never lets a limited-data event outrank one with sufficient data', () => {
    const base = makeEvent({ id: 'x' }).scores!;
    const events = [
      makeEvent({ id: 'new', scores: { ...base, pbScore: 99, pbConfidence: 'insufficient', sampleSize: 3 } }),
      makeEvent({ id: 'established', scores: { ...base, pbScore: 80 } }),
    ];
    const res = bestPick('pb', events, opts);
    expect(res.pick?.event.id).toBe('established');
    const limited = res.alternatives[0]!;
    expect(limited.event.id).toBe('new');
    expect(limited.reasons).toContainEqual({ text: 'Limited data: only 3 recent events', tone: 'caution' });
  });

  it('ranks Place goal by lowest competition', () => {
    const base = makeEvent({ id: 'x' }).scores!;
    const res = bestPick(
      'place',
      [makeEvent({ id: 'hard', scores: { ...base, competitionScore: 80 } }), makeEvent({ id: 'easy', scores: { ...base, competitionScore: 40 } })],
      opts,
    );
    expect(res.pick?.event.id).toBe('easy');
  });

  it('excludes visited events for the New Event goal and ranks by travel', () => {
    const res = bestPick(
      'new_event',
      [
        makeEvent({ id: 'home', visited: true, travel: { distanceKm: 1, minutes: 5, method: 'straight_line_estimate' } }),
        makeEvent({ id: 'far', travel: { distanceKm: 20, minutes: 35, method: 'straight_line_estimate' } }),
        makeEvent({ id: 'near', travel: { distanceKm: 8, minutes: 15, method: 'straight_line_estimate' } }),
      ],
      opts,
    );
    expect(res.pick?.event.id).toBe('near');
    expect(res.alternatives.map((a) => a.event.id)).toEqual(['far']);
  });

  it('respects the travel limit and explains an empty result', () => {
    const res = bestPick('pb', [makeEvent({ id: 'far', travel: { distanceKm: 90, minutes: 95, method: 'straight_line_estimate' } })], opts);
    expect(res.pick).toBeNull();
    expect(res.message).toMatch(/within 45 minutes/);
  });

  it('reports Challenge as not yet available instead of guessing', () => {
    const res = bestPick('challenge', [makeEvent({ id: 'a' })], opts);
    expect(res.pick).toBeNull();
    expect(res.message).toMatch(/not available yet/);
  });

  it('is deterministic for ties (alphabetical)', () => {
    const res = bestPick('pb', [makeEvent({ id: 'zeta' }), makeEvent({ id: 'alpha' })], opts);
    expect(res.pick?.event.id).toBe('alpha');
  });
});
