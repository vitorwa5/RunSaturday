import { describe, expect, it } from 'vitest';
import { CHALLENGE_STATUS_LABEL, challengeFilterLink, letterArticle } from '../lib/display';

describe('challenge display helpers', () => {
  it('uses the spoken article for letters ("an H", "a B")', () => {
    expect(['A', 'E', 'F', 'H', 'L', 'M', 'O', 'S'].map(letterArticle)).toEqual(Array(8).fill('an'));
    expect(['B', 'C', 'D', 'G', 'K', 'U', 'Y', 'Z'].map(letterArticle)).toEqual(Array(8).fill('a'));
  });

  it('links to the generic Explore challenge filter', () => {
    expect(challengeFilterLink('alphabet', 'C')).toBe('/explore?challenge=alphabet&item=C');
    expect(challengeFilterLink('a b', 'x&y')).toBe('/explore?challenge=a%20b&item=x%26y');
  });

  it('labels every status', () => {
    expect(CHALLENGE_STATUS_LABEL).toEqual({ not_started: 'Not started', in_progress: 'In progress', completed: 'Completed' });
  });
});
