import { describe, expect, it } from 'vitest';
import { summarizeResults } from '../domain/occurrenceSummary';

const result = (position: number, finishTimeSeconds: number) => ({ position, finishTimeSeconds });

describe('summarizeResults (Results → EventOccurrence summary cache)', () => {
  it('derives count and placing times from a known result set', () => {
    const results = Array.from({ length: 12 }, (_, i) => result(i + 1, 1000 + i * 10));
    expect(summarizeResults(results)).toEqual({
      participantCount: 12,
      winnerTimeSeconds: 1000,
      thirdTimeSeconds: 1020,
      fifthTimeSeconds: 1040,
      tenthTimeSeconds: 1090,
    });
  });

  it('uses positions, not input order', () => {
    const results = [result(3, 1200), result(1, 1100), result(2, 1150)];
    expect(summarizeResults(results)).toMatchObject({ participantCount: 3, winnerTimeSeconds: 1100, thirdTimeSeconds: 1200 });
  });

  it('leaves positions beyond the field empty', () => {
    expect(summarizeResults([result(1, 1100), result(2, 1150), result(3, 1200), result(4, 1250)])).toMatchObject({
      fifthTimeSeconds: null,
      tenthTimeSeconds: null,
    });
  });

  it('returns all nulls when there are no results (e.g. cancelled)', () => {
    expect(summarizeResults([])).toEqual({
      participantCount: null,
      winnerTimeSeconds: null,
      thirdTimeSeconds: null,
      fifthTimeSeconds: null,
      tenthTimeSeconds: null,
    });
  });
});
