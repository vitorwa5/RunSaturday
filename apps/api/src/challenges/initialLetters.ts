/**
 * INITIAL-LETTERS challenges (kind "initial_letters"), e.g. the Alphabet Challenge: visit events
 * whose names start with each required letter.
 *
 * Normalisation of an event name (deterministic): Unicode NFKD with combining marks removed
 * ("Église" → "Eglise"), upper-cased, leading spaces and punctuation skipped. The first remaining
 * character is the initial if it is A–Z; a name starting with a digit has no initial letter.
 *
 * A letter is completed by the EARLIEST first visit to any qualifying event (ties: event name,
 * then id). Every qualifying visited event stays listed on the item.
 */
import type { ChallengeItem, ChallengeOpportunityEvent } from '@runsaturday/shared';
import type { ChallengeContext, ChallengeEvaluator, InitialLettersDefinition } from './types';

/** The initial letter used by letter challenges, or null when the name has none. */
export function initialLetter(name: string): string | null {
  const plain = name.normalize('NFKD').replace(/\p{M}/gu, '').toUpperCase();
  const first = plain.match(/[\p{L}\p{N}]/u)?.[0];
  return first && /^[A-Z]$/.test(first) ? first : null;
}

export const initialLettersEvaluator: ChallengeEvaluator<InitialLettersDefinition> = {
  items(def, ctx: ChallengeContext): ChallengeItem[] {
    return def.letters.map((letter) => {
      const qualifying = ctx.visited
        .filter((e) => initialLetter(nameOf(ctx, e.eventId, e.eventName)) === letter)
        .map((e) => ({ eventId: e.eventId, eventName: nameOf(ctx, e.eventId, e.eventName), firstVisit: e.firstVisit }))
        .sort((a, b) => a.firstVisit.localeCompare(b.firstVisit) || a.eventName.localeCompare(b.eventName) || a.eventId.localeCompare(b.eventId));
      const first = qualifying[0];
      const opportunities: ChallengeOpportunityEvent[] = first
        ? []
        : ctx.events
            .filter((e) => initialLetter(e.name) === letter)
            .map((e) => ({ eventId: e.id, eventName: e.name, town: e.town, region: e.region }))
            .sort((a, b) => a.eventName.localeCompare(b.eventName) || a.eventId.localeCompare(b.eventId));
      return {
        key: letter,
        label: letter,
        completed: first != null,
        completedBy: first ? { eventId: first.eventId, eventName: first.eventName, date: first.firstVisit } : null,
        qualifyingEvents: qualifying,
        opportunities,
      };
    });
  },
  isItem: (def, key) => def.letters.includes(key),
  matches: (_def, key, event) => initialLetter(event.name) === key,
};

/** The dataset's current name for an event (names can change), else the name on the performance. */
function nameOf(ctx: ChallengeContext, eventId: string, fallback: string): string {
  return ctx.events.find((e) => e.id === eventId)?.name ?? fallback;
}
