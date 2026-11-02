import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { HISTORY_MAX_ROWS } from '@runsaturday/shared';
import { currentUserId, identities, type RequestContext } from '../http/context';
import { AppError, parseInput } from '../http/errors';
import { recalculateRunnerForm } from '../services/runnerForm';
import { planHistory } from './planner';
const Row = z.object({ row: z.number().int().min(2).max(100000), date: z.string().max(20), eventName: z.string().max(200), time: z.string().max(20), position: z.string().max(20).optional(), distance: z.string().max(20).optional(), eventId: z.string().min(1).max(200).nullable().optional() }).strict();
const Rows = z.array(Row).min(1).max(HISTORY_MAX_ROWS);
export async function historyRoutes(app: FastifyInstance, ctx: RequestContext) {
  // A binding is a precondition, never an identity selector. Authenticate from the cookie first.
  const Binding = z.string().min(1).max(200).optional();
  function owner(binding: string | undefined) {
    const id = currentUserId(ctx);
    if (ctx.config.APP_MODE === 'beta' && (!binding || binding !== identities.getStore()?.session?.sessionBinding)) {
      throw new AppError(409, 'session_changed', 'Your account session changed. Reopen the import and choose your file again.');
    }
    return id;
  }
  async function refresh(userId: string) {
    try { await recalculateRunnerForm(ctx.store, userId, ctx.today()); return 'refreshed' as const; }
    catch { return 'deferred' as const; } // Canonical import is committed; invalidated snapshots stay unavailable.
  }
  app.post('/api/profile/history-import/preview', { bodyLimit: 2 * 1024 * 1024 }, async request => {
    parseInput(z.object({}).strict(), request.query);
    const { rows, sessionBinding } = parseInput(z.object({ rows: Rows, sessionBinding: Binding }).strict(), request.body);
    const id = owner(sessionBinding);
    const [existing, events] = await Promise.all([ctx.store.listUserPerformances(id), ctx.store.listHistoryEvents()]);
    return planHistory(rows, existing, events, ctx.today()).preview;
  });
  app.post('/api/profile/history-import/commit', { bodyLimit: 2 * 1024 * 1024 }, async request => {
    parseInput(z.object({}).strict(), request.query);
    const { rows, sessionBinding } = parseInput(z.object({ rows: Rows, sessionBinding: Binding, confirmation: z.literal('IMPORT MY OWN HISTORY') }).strict(), request.body);
    const id = owner(sessionBinding);
    const result = await ctx.store.commitCsvHistory(id, rows, ctx.today());
    return { ...result, formStatus: await refresh(id) };
  });
  app.delete('/api/profile/history-import', async request => {
    parseInput(z.object({}).strict(), request.query);
    const { sessionBinding } = parseInput(z.object({ sessionBinding: Binding, confirmation: z.literal('REMOVE MY CSV HISTORY') }).strict(), request.body);
    const id = owner(sessionBinding);
    const deleted = await ctx.store.deleteCsvHistory(id);
    return { deleted, formStatus: await refresh(id) };
  });
}
