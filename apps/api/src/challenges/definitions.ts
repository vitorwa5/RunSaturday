/**
 * The 5K Compass challenge catalogue: data, not code. A new challenge of an existing kind is a
 * new entry here; a new kind adds a definition type (types.ts) and an evaluator (engine.ts).
 * These are 5K Compass challenges, not official parkrun challenges.
 */
import type { ChallengeDefinition } from './types';

/** A–Z except X: very few 5K events start with X, so 5K Compass leaves it out (25 letters). */
export const ALPHABET_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWYZ'.split('');

export const CHALLENGES: readonly ChallengeDefinition[] = [
  {
    id: 'alphabet',
    kind: 'initial_letters',
    name: 'Alphabet Challenge',
    description: 'Run at events whose names start with each letter of the alphabet (X excepted).',
    letters: ALPHABET_LETTERS,
    rules: [
      'A letter counts when you have recorded a run at a 5K Compass event whose name starts with it.',
      'Event names are read without accents and punctuation; a name starting with a number counts for no letter.',
      'X is not required: very few events start with X.',
      'If several events qualify for a letter, the one you visited first is shown.',
      'Races at courses 5K Compass does not model do not count.',
      'A 5K Compass challenge: not an official parkrun challenge.',
    ],
  },
];
