/**
 * Deterministic synthetic history for DEMO events (FICTIONAL, see demoEvents.ts).
 *
 * A shared population of pseudonymous demo runners ("demo-athlete-00001"; no names) attends
 * the demo events week by week, so the same runner appears at several events: the matched-
 * runner evidence the Course Speed Factor needs.
 *
 * Simulation model (fictional world, documented so it is not mistaken for real data):
 * - Each runner has a home event, a neutral ability (log-normal around the home event's
 *   `medianSeconds`/`spread`), an attendance rate, a tendency to visit other events (nearer
 *   events more likely), and a slow fitness drift.
 * - A run's time = ability × fitness drift × the course's hidden simulation speed effect
 *   × that event-day's conditions × personal day-to-day noise, with an occasional easy
 *   "jog/pacing" run. The hidden course effect is derived from the demo course's elevation,
 *   surface and laps plus a small layout quirk (see `simulationCourseEffect`). The analytics
 *   never read it: they must recover course speed from matched runners.
 * - Times have a 13:00 safety floor only; there is no 15:00 clamp, so winners are realistic.
 *
 * Every random draw is seeded from stable strings (runner index, ISO date), so a given date's
 * results never change and re-seeding is reproducible. Results are canonical; occurrence
 * summaries are derived with summarizeResults().
 */
import { addDays } from '@runsaturday/shared';
import { summarizeResults, type OccurrenceSummary } from '../domain/occurrenceSummary';
import { hashString, mulberry32 } from '../domain/random';
import type { DemoEventDefinition } from './demoEvents';

export interface DemoResult {
  position: number;
  finishTimeSeconds: number;
  /** Pseudonymous, fictional runner key. */
  athleteKey: string;
}

export interface DemoOccurrence extends OccurrenceSummary {
  date: string;
  status: 'COMPLETED' | 'CANCELLED';
  results: DemoResult[];
}

/** Standard normal sample via Box–Muller. */
function normal(rand: () => number): number {
  const u = Math.max(rand(), Number.EPSILON);
  const v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Simulation parameters for the fictional population (not used by any analytics). */
export const DEMO_SIMULATION = {
  /** Runners per home event ≈ meanParticipants / mean attendance (visits in and out roughly balance). */
  ATTENDANCE_RANGE: [0.35, 0.75] as const,
  /** Share of runners who never visit another event, and the weekly visit rate of the rest. */
  HOME_ONLY_SHARE: 0.45,
  TOURIST_RANGE: [0.01, 0.12] as const,
  /** Personal day-to-day variation (log-sd). */
  DAY_NOISE: 0.022,
  /** Event-day conditions shared by everyone at that event that day (log-sd). */
  CONDITIONS_NOISE: 0.01,
  /** Weekly fitness drift per runner (log-sd of the per-week slope). */
  DRIFT: 0.0006,
  /** Probability of an easy run (jogging, pacing, unwell) and its slowdown range. */
  EASY_RUN_PROBABILITY: 0.025,
  EASY_RUN_SLOWDOWN: [1.15, 1.6] as const,
  MIN_SECONDS: 13 * 60,
  MAX_SECONDS: 75 * 60,
  /** Fixed reference date for fitness drift, so results do not depend on "today". */
  DRIFT_EPOCH: '2026-01-03',
} as const;

const SURFACE_EFFECT: Record<DemoEventDefinition['surface'], number> = { TARMAC: 0, MIXED: 0.012, GRASS: 0.025, TRAIL: 0.035, UNKNOWN: 0.015 };
const STRUCTURE_EFFECT: Record<DemoEventDefinition['courseType'], number> = {
  POINT_TO_POINT: 0,
  ONE_LAP: 0,
  OUT_AND_BACK: 0.004,
  TWO_LAPS: 0.003,
  THREE_PLUS_LAPS: 0.007,
  UNKNOWN: 0.003,
};

/**
 * The fictional world's hidden course speed effect (multiplier on neutral ability). Part
 * structural, part an unobservable layout quirk (±1.2%) so observed speed is not a pure
 * function of the structural facts. Analytics never read this.
 */
export function simulationCourseEffect(def: DemoEventDefinition): number {
  const quirk = (mulberry32(hashString(`layout|${def.slug}`))() - 0.5) * 0.024;
  return (1 + 0.00045 * (def.elevationM ?? 30)) * (1 + SURFACE_EFFECT[def.surface]) * (1 + STRUCTURE_EFFECT[def.courseType]) * (1 + quirk);
}

interface Runner {
  key: string;
  home: number;
  ability: number;
  attendance: number;
  tourist: number;
  driftPerWeek: number;
}

const weeksBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / (7 * 86_400_000));

function buildPopulation(defs: readonly DemoEventDefinition[]): Runner[] {
  const runners: Runner[] = [];
  const [aLo, aHi] = DEMO_SIMULATION.ATTENDANCE_RANGE;
  const meanAttendance = (aLo + aHi) / 2;
  defs.forEach((def, home) => {
    const count = Math.round(def.history.meanParticipants / meanAttendance);
    for (let i = 0; i < count; i++) {
      const index = runners.length + 1;
      const rand = mulberry32(hashString(`runner|${index}`));
      runners.push({
        key: `demo-athlete-${String(index).padStart(5, '0')}`,
        home,
        ability: def.history.medianSeconds * Math.exp(def.history.spread * normal(rand)),
        attendance: aLo + (aHi - aLo) * rand(),
        tourist:
          rand() < DEMO_SIMULATION.HOME_ONLY_SHARE
            ? 0
            : DEMO_SIMULATION.TOURIST_RANGE[0] + (DEMO_SIMULATION.TOURIST_RANGE[1] - DEMO_SIMULATION.TOURIST_RANGE[0]) * rand(),
        driftPerWeek: DEMO_SIMULATION.DRIFT * normal(rand),
      });
    }
  });
  return runners;
}

/** Visit weights: nearer events are more likely (inverse distance in degrees, softened). */
function visitWeights(defs: readonly DemoEventDefinition[], from: number, active: boolean[]): number[] {
  const a = defs[from]!;
  return defs.map((d, i) => {
    if (i === from || !active[i]) return 0;
    const dist = Math.hypot(d.latitude - a.latitude, (d.longitude - a.longitude) * 0.6);
    return 1 / (dist + 0.08);
  });
}

function pick(weights: number[], r: number): number {
  const total = weights.reduce((s, w) => s + w, 0);
  let acc = 0;
  for (let i = 0; i < weights.length; i++) {
    acc += weights[i]! / total;
    if (r < acc) return i;
  }
  return weights.findLastIndex((w) => w > 0);
}

/**
 * Weekly occurrences for every demo event, oldest first, ending on `latestDate` (an ISO
 * Saturday). Returned in the same order as `defs`.
 */
export function generateDemoHistories(defs: readonly DemoEventDefinition[], latestDate: string): DemoOccurrence[][] {
  const runners = buildPopulation(defs);
  const sim = DEMO_SIMULATION;
  const maxWeeks = Math.max(...defs.map((d) => d.history.weeks));
  const courseEffect = defs.map(simulationCourseEffect);
  const histories: DemoOccurrence[][] = defs.map(() => []);

  for (let weeksAgo = maxWeeks - 1; weeksAgo >= 0; weeksAgo--) {
    const date = addDays(latestDate, -7 * weeksAgo);
    // An event is held this week if it has started and is not cancelled.
    const started = defs.map((d) => weeksAgo < d.history.weeks);
    const cancelled = defs.map((d) => (d.history.cancelledWeeksAgo ?? []).includes(weeksAgo));
    const held = defs.map((_, i) => started[i]! && !cancelled[i]!);
    const conditions = defs.map((d) => Math.exp(sim.CONDITIONS_NOISE * normal(mulberry32(hashString(`conditions|${d.slug}|${date}`)))));
    const fields: { key: string; seconds: number }[][] = defs.map(() => []);
    const weekIndex = weeksBetween(sim.DRIFT_EPOCH, date);

    for (const runner of runners) {
      const rand = mulberry32(hashString(`${runner.key}|${date}`));
      if (rand() >= runner.attendance) continue;
      // Home if it is held and the runner is not touring this week; otherwise somewhere nearby
      // (runners whose home event has not started yet run elsewhere).
      let event = runner.home;
      const tour = rand() < runner.tourist;
      if (tour || !started[runner.home]) {
        const weights = visitWeights(defs, runner.home, started);
        if (weights.every((w) => w === 0)) continue;
        event = pick(weights, rand());
      }
      if (!held[event]) continue; // cancelled: no run this week
      let seconds =
        runner.ability *
        (1 + runner.driftPerWeek * weekIndex) *
        courseEffect[event]! *
        conditions[event]! *
        Math.exp(sim.DAY_NOISE * normal(rand));
      if (rand() < sim.EASY_RUN_PROBABILITY) {
        seconds *= sim.EASY_RUN_SLOWDOWN[0] + (sim.EASY_RUN_SLOWDOWN[1] - sim.EASY_RUN_SLOWDOWN[0]) * rand();
      }
      fields[event]!.push({ key: runner.key, seconds: Math.round(Math.min(sim.MAX_SECONDS, Math.max(sim.MIN_SECONDS, seconds))) });
    }

    defs.forEach((_, i) => {
      if (!started[i]) return;
      if (cancelled[i]) {
        histories[i]!.push({ date, status: 'CANCELLED', ...summarizeResults([]), results: [] });
        return;
      }
      // Equal times are ordered by runner key so positions are deterministic.
      const sorted = fields[i]!.sort((a, b) => a.seconds - b.seconds || a.key.localeCompare(b.key));
      const results = sorted.map((r, p) => ({ position: p + 1, finishTimeSeconds: r.seconds, athleteKey: r.key }));
      histories[i]!.push({ date, status: 'COMPLETED', ...summarizeResults(results), results });
    });
  }
  return histories;
}
