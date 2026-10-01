import { describe, expect, it } from 'vitest';
import { competitionBand, difficultyBand, formatDifficulty, formatMeters, formatScore, opportunityBand } from '../lib/display';

describe('opportunityBand', () => {
  it.each([
    [100, 'Excellent'],
    [85, 'Excellent'],
    [84, 'Good'],
    [65, 'Good'],
    [64, 'Low'],
    [null, 'No score'],
  ])('%s → %s', (score, label) => {
    expect(opportunityBand(score).label).toBe(label);
  });
});

describe('competitionBand', () => {
  it('never uses positive or problem tones', () => {
    for (const s of [0, 30, 50, 90]) expect(competitionBand(s).tone).toBe('info');
  });
});

describe('difficultyBand', () => {
  it('maps the 1–10 scale', () => {
    expect(difficultyBand(2.1).label).toBe('Easy');
    expect(difficultyBand(5).label).toBe('Moderate');
    expect(difficultyBand(7.2).label).toBe('Hard');
  });
});

describe('formatters', () => {
  it('formats missing values honestly', () => {
    expect(formatScore(null)).toBe('—');
    expect(formatDifficulty(undefined)).toBe('—');
    expect(formatMeters(null)).toBe('Unknown');
  });

  it('rounds scores and fixes difficulty to one decimal', () => {
    expect(formatScore(91.6)).toBe('92');
    expect(formatDifficulty(2)).toBe('2.0');
  });
});
