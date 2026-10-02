import { describe, expect, it } from 'vitest';
import { bestPick, highlights, rankEvents } from '../services/recommendations';
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
    expect(res.pick?.rankedBy).toEqual({ key: 'pb_score', label: 'PB opportunity', value: 91, outOf: 100, direction: 'higher_is_better' });
    expect(res.pick?.rank).toBe(1);
    expect(res.pick?.reasons.map((r) => r.text)).toContain('High PB Score (91/100)');
    expect(res.method).toBe('ranked using PB Score');
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
    expect(limited.reasons).toContainEqual({ text: 'PB Score unavailable: limited matched-runner data', tone: 'caution' });
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
    expect(res.message).toMatch(/arrive once personal run history/);
  });

  it('explains travel relative to the travel limit, labelled as an estimate', () => {
    const res = bestPick('pb', [makeEvent({ id: 'a' })], opts);
    expect(res.pick?.reasons.map((r) => r.text)).toContain('Within your travel limit (about 20 of 45 min, estimated)');
  });

  it('is deterministic for ties (alphabetical)', () => {
    const res = bestPick('pb', [makeEvent({ id: 'zeta' }), makeEvent({ id: 'alpha' })], opts);
    expect(res.pick?.event.id).toBe('alpha');
  });
});

describe('rankEvents', () => {
  it('returns every eligible event with consecutive ranks', () => {
    const ranking = rankEvents('pb', [makeEvent({ id: 'a' }), makeEvent({ id: 'b' }), makeEvent({ id: 'c' })], 45);
    expect(ranking.results.map((r) => r.rank)).toEqual([1, 2, 3]);
  });

  it('marks lower-is-better metrics for the Place goal', () => {
    const ranking = rankEvents('place', [makeEvent({ id: 'a' })], 45);
    expect(ranking.results[0]!.rankedBy).toMatchObject({ label: 'Competition', direction: 'lower_is_better', outOf: 100 });
  });

  it('flags a demanding course as a caution for PB', () => {
    const base = makeEvent({ id: 'x' }).scores!;
    const [r] = rankEvents('pb', [makeEvent({ id: 'hilly', elevationM: 126, scores: { ...base, pbScore: 41, difficultyScore: 7.4 } })], 45).results;
    expect(r!.reasons.filter((x) => x.tone === 'caution').map((x) => x.text)).toEqual([
      'Lower PB Score (41/100)',
      'Demanding course (7.4/10)',
      'Hilly (126 m elevation)',
    ]);
  });
});

describe('highlights', () => {
  const base = makeEvent({ id: 'x' }).scores!;
  const fastFlat = makeEvent({
    id: 'ff',
    elevationM: 10,
    averageParticipants: 100,
    scores: { ...base, pbScore: 92, competitionScore: 40 },
    travel: { distanceKm: 3, minutes: 9, method: 'straight_line_estimate' },
  });

  it('orders tags by relevance to the goal and caps at three', () => {
    expect(highlights(fastFlat, 'pb')).toEqual(['Fast', 'Flat', 'Tarmac']);
    expect(highlights(fastFlat, 'place')).toEqual(['Lower competition', 'Small field', 'Close by']);
    expect(highlights(fastFlat, 'quiet')).toEqual(['Small field', 'Close by', 'Fast']);
  });

  it('only uses facts present in the data', () => {
    expect(highlights(makeEvent({ id: 'u', elevationM: null, surface: 'unknown', averageParticipants: null, scores: null, travel: undefined, visited: undefined }), 'pb')).toEqual([]);
  });
});
