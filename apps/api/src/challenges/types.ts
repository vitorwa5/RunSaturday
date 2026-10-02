import type { ChallengeItem, ChallengeKind, VisitedEvent } from '@runsaturday/shared';
import type { EventRecord } from '../repositories/DataStore';

/** What every challenge is evaluated from: the user's visits and the current event dataset. */
export interface ChallengeContext {
  asOfDate: string;
  /** Visited known events (derived from performances). */
  visited: VisitedEvent[];
  /** Active events in the dataset, for opportunities. */
  events: EventRecord[];
}

interface BaseDefinition {
  id: string;
  kind: ChallengeKind;
  name: string;
  description: string;
  rules: string[];
}

/** Visit events whose names start with each of `letters`. */
export interface InitialLettersDefinition extends BaseDefinition {
  kind: 'initial_letters';
  /** Required letters, explicit (the UI never assumes A–Z). */
  letters: readonly string[];
}

/** Union of all definition shapes; add one per new kind. */
export type ChallengeDefinition = InitialLettersDefinition;

/**
 * One evaluator per kind. It only turns a definition + context into items; status, progress
 * and percentages are computed once, generically, by the engine.
 */
export interface ChallengeEvaluator<D extends ChallengeDefinition> {
  items(def: D, ctx: ChallengeContext): ChallengeItem[];
  /** Whether `key` is one of the definition's items. */
  isItem(def: D, key: string): boolean;
  /** Whether a visit to this event would satisfy item `key` (Explore filter, Event page). */
  matches(def: D, key: string, event: Pick<EventRecord, 'id' | 'name' | 'town' | 'region'>): boolean;
}
