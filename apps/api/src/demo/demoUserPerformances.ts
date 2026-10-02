/**
 * The demo user's dated performance history (FICTIONAL), migrated from the single values the
 * demo user had before Phase 4A (DEMO_USER_LEGACY_HISTORY):
 * - each event keeps its visit count and its PB time;
 * - the lifetime PB (18:58 at Riverside) is dated about 30 weeks ago, outside the recent window;
 * - the recent best (19:32 at Riverside) is dated 2 weeks ago, inside it.
 * The other runs are deterministic and always slower than the PB they sit under (and, within the
 * recent window, slower than the recent best), so the derived values reproduce the legacy ones.
 * Dates are Saturdays counted back from the dataset's latest date; seeds are fixed strings.
 */
import { addDays } from '@runsaturday/shared';
import { hashString, mulberry32 } from '../domain/random';
import { DEMO_USER, DEMO_USER_LEGACY_HISTORY } from './demoEvents';

export interface DemoUserPerformance {
  id: string;
  userId: string;
  eventId: string;
  date: string;
  finishTimeSeconds: number;
}

const HISTORY_WEEKS = 80;
const RECENT_BEST_WEEKS_AGO = 2;
const LIFETIME_PB_WEEKS_AGO = 30;
/** Runs in the recent window must not beat the recent best; older Lakeside runs stay outside it. */
const RECENT_WEEKS = 13;

export function demoUserPerformances(latestDate: string): DemoUserPerformance[] {
  const rand = mulberry32(hashString('demo-user-history'));
  const pool = Array.from({ length: HISTORY_WEEKS }, (_, w) => w).filter((w) => w !== RECENT_BEST_WEEKS_AGO && w !== LIFETIME_PB_WEEKS_AGO);
  // Deterministic Fisher–Yates shuffle.
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }
  const take = (n: number, ok: (w: number) => boolean = () => true) => {
    const picked: number[] = [];
    for (let i = 0; i < pool.length && picked.length < n; ) {
      if (ok(pool[i]!)) picked.push(...pool.splice(i, 1));
      else i++;
    }
    return picked;
  };

  const runs: { eventId: string; weeksAgo: number; seconds: number }[] = [];
  const slower = (base: number) => Math.round(base * (1.004 + 0.045 * rand()));
  const { lifetimePb, recentBest } = DEMO_USER_LEGACY_HISTORY;

  for (const e of DEMO_USER_LEGACY_HISTORY.events) {
    if (e.eventId === lifetimePb.eventId) {
      runs.push({ eventId: e.eventId, weeksAgo: LIFETIME_PB_WEEKS_AGO, seconds: lifetimePb.seconds });
      runs.push({ eventId: e.eventId, weeksAgo: RECENT_BEST_WEEKS_AGO, seconds: recentBest.seconds });
      for (const w of take(e.visitCount - 2)) {
        runs.push({ eventId: e.eventId, weeksAgo: w, seconds: slower(w <= RECENT_WEEKS ? recentBest.seconds : lifetimePb.seconds) });
      }
      continue;
    }
    // A PB faster than the recent best must sit outside the recent window.
    const ok = e.personalBestSeconds < recentBest.seconds ? (w: number) => w > RECENT_WEEKS : undefined;
    const [pbWeek, ...others] = take(e.visitCount, ok);
    runs.push({ eventId: e.eventId, weeksAgo: pbWeek!, seconds: e.personalBestSeconds });
    for (const w of others) runs.push({ eventId: e.eventId, weeksAgo: w, seconds: slower(Math.max(e.personalBestSeconds, recentBest.seconds)) });
  }

  return runs
    .map((r) => {
      const date = addDays(latestDate, -7 * r.weeksAgo);
      return { id: `demo-perf-${date}-${r.eventId}`, userId: DEMO_USER.id, eventId: r.eventId, date, finishTimeSeconds: r.seconds };
    })
    .sort((a, b) => b.date.localeCompare(a.date));
}
