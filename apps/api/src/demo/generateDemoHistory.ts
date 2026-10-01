/**
 * Deterministic synthetic history for DEMO events (fictional data, see demoEvents.ts).
 *
 * Each occurrence's results are generated from a seed derived from the event slug and
 * date, so the same date always yields the same results regardless of when you seed.
 * Results are canonical; the occurrence summary (participant count, winner/3rd/5th/10th
 * times) is derived from them with summarizeResults(), exactly as real ingestion must do.
 */
import { addDays } from '@runsaturday/shared';
import { summarizeResults, type OccurrenceSummary } from '../domain/occurrenceSummary';
import type { DemoEventDefinition } from './demoEvents';

export interface DemoResult {
  position: number;
  finishTimeSeconds: number;
}

export interface DemoOccurrence extends OccurrenceSummary {
  date: string;
  status: 'COMPLETED' | 'CANCELLED';
  results: DemoResult[];
}

/** 32-bit FNV-1a hash, used to seed the PRNG from a string. */
function hashString(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32: small, fast, deterministic PRNG returning floats in [0, 1). */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Standard normal sample via Box–Muller. */
function normal(rand: () => number): number {
  const u = Math.max(rand(), Number.EPSILON);
  const v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

const MIN_DEMO_SECONDS = 15 * 60;
const MAX_DEMO_SECONDS = 60 * 60;

function generateOccurrence(def: DemoEventDefinition, date: string, cancelled: boolean): DemoOccurrence {
  if (cancelled) {
    return { date, status: 'CANCELLED', ...summarizeResults([]), results: [] };
  }

  const rand = mulberry32(hashString(`${def.slug}|${date}`));
  const { meanParticipants, medianSeconds, spread } = def.history;

  const participantCount = Math.max(12, Math.round(meanParticipants * (1 + 0.15 * normal(rand))));
  // Week-to-week conditions shift the whole field slightly.
  const weekFactor = 1 + 0.015 * normal(rand);

  const times: number[] = [];
  for (let i = 0; i < participantCount; i++) {
    const t = medianSeconds * weekFactor * Math.exp(spread * normal(rand));
    times.push(Math.round(Math.min(MAX_DEMO_SECONDS, Math.max(MIN_DEMO_SECONDS, t))));
  }
  times.sort((a, b) => a - b);

  const results = times.map((finishTimeSeconds, i) => ({ position: i + 1, finishTimeSeconds }));
  return { date, status: 'COMPLETED', ...summarizeResults(results), results };
}

/**
 * Weekly occurrences for one demo event, oldest first, ending on `latestDate`
 * (an ISO Saturday).
 */
export function generateDemoHistory(def: DemoEventDefinition, latestDate: string): DemoOccurrence[] {
  const cancelled = new Set(def.history.cancelledWeeksAgo ?? []);
  const occurrences: DemoOccurrence[] = [];
  for (let weeksAgo = def.history.weeks - 1; weeksAgo >= 0; weeksAgo--) {
    const date = addDays(latestDate, -7 * weeksAgo);
    occurrences.push(generateOccurrence(def, date, cancelled.has(weeksAgo)));
  }
  return occurrences;
}
