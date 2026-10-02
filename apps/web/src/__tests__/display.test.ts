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

describe('course speed and PB display', () => {
  it('labels PB Score without a demo prefix', async () => {
    const { pbLabel } = await import('../lib/display');
    expect(pbLabel()).toBe('PB Score');
    expect(pbLabel(true)).toBe('PB');
  });

  it('describes Course Speed Factors relative to the average', async () => {
    const { factorPhrase, formatFactor } = await import('../lib/display');
    expect(formatFactor(0.96904)).toBe('0.969');
    expect(factorPhrase(0.969)).toBe('3.1% faster than average');
    expect(factorPhrase(1.055)).toBe('5.5% slower than average');
    expect(factorPhrase(1.001)).toBe('about average');
    expect(factorPhrase(null)).toBe('Limited matched-runner data');
  });

  it('formats signed adjustment seconds', async () => {
    const { formatDeltaSeconds } = await import('../lib/display');
    expect(formatDeltaSeconds(72)).toBe('+1:12');
    expect(formatDeltaSeconds(-20)).toBe('−0:20');
    expect(formatDeltaSeconds(0)).toBe('±0:00');
  });
});
