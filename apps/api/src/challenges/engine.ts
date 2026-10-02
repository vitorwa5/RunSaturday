/**
 * CHALLENGE ENGINE (Phase 5A). Deterministic, server-side, derived only from canonical history:
 *
 *   performances ─▶ deriveVisits ─▶ ChallengeContext (+ active events) ─▶ evaluator.items(def)
 *                                                                        ─▶ finalize: status, progress
 *
 * Definitions are data (definitions.ts); each kind has one evaluator (EVALUATORS). Status,
 * progress and percentage are computed here for every kind, so they mean the same everywhere.
 * Clients can never submit completion: there is no write path.
 */
import type { ChallengeItem, ChallengeItemRef, ChallengeResult, ChallengeStatus } from '@runsaturday/shared';
import type { EventRecord } from '../repositories/DataStore';
import { CHALLENGES } from './definitions';
import { initialLettersEvaluator } from './initialLetters';
import type { ChallengeContext, ChallengeDefinition, ChallengeEvaluator } from './types';

const EVALUATORS: { [K in ChallengeDefinition['kind']]: ChallengeEvaluator<Extract<ChallengeDefinition, { kind: K }>> } = {
  initial_letters: initialLettersEvaluator,
};

const evaluatorOf = (def: ChallengeDefinition) => EVALUATORS[def.kind] as ChallengeEvaluator<ChallengeDefinition>;

export function findChallenge(id: string, catalogue: readonly ChallengeDefinition[] = CHALLENGES): ChallengeDefinition | null {
  return catalogue.find((c) => c.id === id) ?? null;
}

/** Status, progress and dates from items (generic for every kind). */
export function finalize(def: ChallengeDefinition, items: ChallengeItem[]): ChallengeResult {
  const done = items.filter((i) => i.completed);
  const target = items.length;
  const status: ChallengeStatus = done.length === 0 ? 'not_started' : done.length === target ? 'completed' : 'in_progress';
  const completedOn = status === 'completed' ? done.map((i) => i.completedBy!.date).sort().at(-1)! : null;
  return {
    id: def.id,
    kind: def.kind,
    name: def.name,
    description: def.description,
    rules: def.rules,
    status,
    progress: { current: done.length, target, percentage: target === 0 ? 0 : Math.round((100 * done.length) / target) },
    completedItems: done.map((i) => i.key),
    missingItems: items.filter((i) => !i.completed).map((i) => i.key),
    completedOn,
    items,
  };
}

export function evaluateChallenge(def: ChallengeDefinition, ctx: ChallengeContext): ChallengeResult {
  return finalize(def, evaluatorOf(def).items(def, ctx));
}

export function evaluateChallenges(ctx: ChallengeContext, catalogue: readonly ChallengeDefinition[] = CHALLENGES): ChallengeResult[] {
  return catalogue.map((def) => evaluateChallenge(def, ctx));
}

export function itemRef(def: ChallengeDefinition, key: string): ChallengeItemRef {
  return { challengeId: def.id, challengeName: def.name, itemKey: key, itemLabel: key };
}

/** Events in the dataset that satisfy one item (the generic Explore challenge filter). */
export function eventsMatching(def: ChallengeDefinition, key: string, events: readonly EventRecord[]): EventRecord[] {
  const evaluator = evaluatorOf(def);
  return evaluator.isItem(def, key) ? events.filter((e) => evaluator.matches(def, key, e)) : [];
}

export const isChallengeItem = (def: ChallengeDefinition, key: string) => evaluatorOf(def).isItem(def, key);

/** Missing items of evaluated challenges that a visit to this event would complete. */
export function helpsWith(event: Pick<EventRecord, 'id' | 'name' | 'town' | 'region'>, results: readonly ChallengeResult[], catalogue: readonly ChallengeDefinition[] = CHALLENGES): ChallengeItemRef[] {
  return results.flatMap((r) => {
    const def = findChallenge(r.id, catalogue)!;
    return r.missingItems.filter((key) => evaluatorOf(def).matches(def, key, event)).map((key) => itemRef(def, key));
  });
}
