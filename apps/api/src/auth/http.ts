import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { deliveryStatus, type Auth } from './auth';
import type { Db } from '../db/prisma';
import type { RequestContext } from '../http/context';
import { currentUserId, currentUser, identities } from '../http/context';
import { AppError, parseInput } from '../http/errors';
import { usesSecureAuthCookies } from '../config/env';
import { consumeEmailBudget } from './emailBudget';

export interface AuthRuntime { auth: Auth; db: Db; emailBudgetNow?: () => Date }
const Email = z.string().trim().toLowerCase().pipe(z.email().max(254));
const SendCode = z.object({ email: Email }).strict();
const VerifyCode = z.object({ email: Email, otp: z.string().regex(/^\d{6}$/) }).strict();
export function authHeaders(request: FastifyRequest): Headers {
  const headers = new Headers();
  for (const [key, value] of Object.entries(request.headers)) {
    if (value != null) headers.set(key, Array.isArray(value) ? value.join(',') : value);
  }
  headers.set('x-compass-client-ip', request.ip);
  return headers;
}

/** The session is validated on every request; no cookie cache or fixed identity in beta. */
export function installIdentity(app: FastifyInstance, ctx: RequestContext, runtime?: AuthRuntime) {
  if (ctx.config.APP_MODE === 'beta' && (!runtime || ctx.store.kind !== 'database')) throw new Error('Beta requires database-backed authentication');
  const resolved = new WeakMap<FastifyRequest, string | null>();
  app.addHook('onRequest', async (request, reply) => {
    reply.header('Cache-Control', 'private, no-store');
    if (ctx.config.APP_MODE === 'beta' && !['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
      const expected = new URL(ctx.config.AUTH_BASE_URL!).origin;
      if (request.headers.origin !== expected || request.headers['sec-fetch-site'] === 'cross-site') {
        throw new AppError(403, 'invalid_origin', 'Open 5K Compass from its own website to make changes.');
      }
    }
    if (ctx.config.APP_MODE === 'demo') { resolved.set(request, 'demo-user'); return; }
    const session = await runtime!.auth.api.getSession({ headers: authHeaders(request) });
    // Verify the internal row as well: deleted, unverified and demo users cannot act as real users.
    const owner = session && session.user.id !== 'demo-user' ? await runtime!.db.user.findFirst({ where: { id: session.user.id, emailVerified: true, isDemo: false }, select: { id: true } }) : null;
    resolved.set(request, owner?.id ?? null);
    if (!owner && (request.url.startsWith('/api/profile') || request.url.startsWith('/api/account/export') || (request.url === '/api/account' && request.method === 'DELETE'))) {
      throw new AppError(401, 'authentication_required', 'Sign in to access your account.');
    }
  });
  app.addHook('onRoute', (route) => {
    const handler = route.handler;
    route.handler = function(request, reply) {
      return identities.run({ userId: resolved.get(request) ?? null }, () => handler.call(this, request, reply));
    };
  });
}

export async function accountRoutes(app: FastifyInstance, ctx: RequestContext, runtime?: AuthRuntime) {
  app.get('/api/account/session', async (request) => {
    const userId = identities.getStore()?.userId;
    if (ctx.config.APP_MODE === 'demo') return { mode: 'demo', user: { id: userId, email: null } };
    const user = userId ? await runtime!.db.user.findUnique({ where: { id: userId }, select: { id: true, email: true } }) : null;
    const session = user ? await runtime!.auth.api.getSession({ headers: authHeaders(request) }) : null;
    return { mode: 'beta', user, expiresAt: session?.session.expiresAt.toISOString() };
  });
  if (!runtime) return;
  for (const path of ['/email-otp/send-verification-otp', '/sign-in/email-otp', '/sign-out']) {
    app.post(`/api/auth${path}`, async (request, reply) => {
      let body: object = {};
      if (path === '/email-otp/send-verification-otp') {
        const input = parseInput(SendCode, request.body);
        await consumeEmailBudget(runtime.db, input.email, 'send', runtime.emailBudgetNow?.());
        body = { ...input, type: 'sign-in' };
      } else if (path === '/sign-in/email-otp') {
        const input = parseInput(VerifyCode, request.body);
        await consumeEmailBudget(runtime.db, input.email, 'verify', runtime.emailBudgetNow?.());
        body = { ...input, name: 'Runner' };
      }
      if (path === '/sign-out') {
        try {
          const session = await runtime.auth.api.getSession({ headers: authHeaders(request) });
          if (session) {
            // Commit revocation before Better Auth clears cookies: its sign-out catches delete failures.
            // deleteMany is idempotent if another request already revoked the same session.
            await runtime.db.session.deleteMany({ where: { id: session.session.id, token: session.session.token } });
          }
        } catch {
          // Do not clear the retry cookie or claim successful revocation on a database failure.
          throw new AppError(503, 'logout_unavailable', 'We could not revoke your session. Please try signing out again.');
        }
      }
      const status = { failed: false };
      const response = await deliveryStatus.run(status, () => runtime.auth.handler(new Request(`${ctx.config.AUTH_BASE_URL}/api/auth${path}`, {
        method: 'POST', headers: authHeaders(request), body: JSON.stringify(body),
      })));
      if (status.failed) {
        const input = body as { email: string };
        await runtime.db.verification.deleteMany({ where: { identifier: `sign-in-otp-${input.email}` } });
        throw new AppError(503, 'email_unavailable', 'We could not send your sign-in code. Please try again.');
      }
      for (const cookie of response.headers.getSetCookie()) reply.header('set-cookie', [...((reply.getHeader('set-cookie') as string[] | undefined) ?? []), cookie]);
      if (!response.ok) {
        // Never forward auth internals, provider details, session tokens or codes to the browser.
        return reply.status(response.status).send({ error: { code: 'authentication_failed', message: response.status === 429 ? 'Too many attempts. Please wait before trying again.' : 'Sign-in could not be completed. Check the code or request a new one.' } });
      }
      if (path === '/sign-in/email-otp') {
        // Successful verification always creates a fresh opaque session. Revoke the replaced session.
        const previous = await runtime.auth.api.getSession({ headers: authHeaders(request) });
        if (previous) await runtime.db.session.deleteMany({ where: { id: previous.session.id } });
      }
      return { success: true };
    });
  }
  app.get('/api/account/export', async () => {
    const id = currentUserId(ctx);
    const user = await runtime.db.user.findUniqueOrThrow({ where: { id }, select: { id: true, email: true, emailVerified: true, displayName: true, homeLat: true, homeLon: true, homeLabel: true, defaultTravelMinutes: true, preferredGoal: true, createdAt: true } });
    const derived = await currentUser(ctx);
    const [performances, favourites, snapshots] = await Promise.all([
      ctx.store.listUserPerformances(id),
      runtime.db.userEvent.findMany({ where: { userId: id, favourite: true }, select: { eventId: true } }),
      runtime.db.runnerFormSnapshot.findMany({ where: { userId: id }, select: { asOfDate: true, calculationVersion: true, performanceRevision: true, components: true } }),
    ]);
    return { format: '5k-compass-account-v1', exportedAt: new Date().toISOString(), profile: user, performances, favourites, summaries: { performance: derived?.performance, currentForm: derived?.currentForm }, derivedSnapshots: snapshots };
  });
  app.delete('/api/account', async (request, reply) => {
    parseInput(z.object({ confirmation: z.literal('DELETE MY ACCOUNT') }).strict(), request.body);
    const id = currentUserId(ctx);
    await runtime.db.$transaction(async (tx) => {
      const user = await tx.user.findUniqueOrThrow({ where: { id }, select: { email: true } });
      if (user.email) {
        await tx.verification.deleteMany({ where: { identifier: { in: [`sign-in-otp-${user.email}`, `email-verification-otp-${user.email}`, `forget-password-otp-${user.email}`, `change-email-otp-${user.email}`] } } });
        await tx.emailAuthBudget.deleteMany({ where: { email: user.email } });
        // Remove any legacy email budgets retained by the additive migration too.
        await tx.rateLimit.deleteMany({ where: { key: { in: [`email:${user.email}:send`, `email:${user.email}:verify`] } } });
      }
      await tx.user.delete({ where: { id } }); // FK cascades include all historical personal JSON snapshots.
    });
    const secure = usesSecureAuthCookies(ctx.config);
    const cookie = `${secure ? '__Secure-' : ''}5k-compass.session_token=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`;
    reply.header('set-cookie', cookie);
    return reply.status(204).send();
  });
}
