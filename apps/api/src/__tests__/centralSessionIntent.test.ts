import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance, InjectOptions } from 'fastify';
import { buildApp } from '../app';
import { createAuth } from '../auth/auth';
import { loadConfig } from '../config/env';
import { createPrismaClient } from '../db/prisma';
import { PrismaDataStore } from '../repositories/prisma/PrismaDataStore';
import { CatalogueImportService } from '../catalogue/importService';

const url = process.env.TEST_DATABASE_URL;
const origin = 'http://localhost:5173';
const header = 'x-compass-session-binding';
const run = randomUUID();

describe.skipIf(!url)('CENTRAL independent originating-session API regressions', () => {
  const db = createPrismaClient(url!);
  const store = new PrismaDataStore(db, 'demo_v0');
  const codes = new Map<string, string>();
  let app: FastifyInstance;
  let eventId: string;
  let counter = 0;
  let ip = 0;
  const namespace = `central-qa-${run}`;
  const config = loadConfig({ APP_MODE: 'beta', NODE_ENV: 'test', DATA_SOURCE: 'database', DATABASE_URL: url, AUTH_BASE_URL: origin, AUTH_ALLOW_INSECURE_LOCAL_HTTP: 'true', AUTH_SECRET: 'central-qa-only-secret-at-least-32-characters', EMAIL_TRANSPORT: 'test', LOG_LEVEL: 'silent' });
  const request = (options: InjectOptions) => app.inject({ remoteAddress: `10.61.${Math.floor(++ip / 250)}.${ip % 250 + 1}`, ...options, headers: { origin, ...(options.payload === undefined ? {} : { 'content-type': 'application/json' }), ...options.headers } });
  const send = (email: string) => request({ method: 'POST', url: '/api/auth/email-otp/send-verification-otp', payload: { email } });
  const session = async (cookie: string) => (await request({ url: '/api/account/session', headers: { cookie } })).json();
  const login = async (email = `central-qa-${run}-${++counter}@example.test`, previous?: { cookie: string; binding: string }) => {
    expect((await send(email)).statusCode).toBe(200);
    const response = await request({ method: 'POST', url: '/api/auth/sign-in/email-otp', headers: { ...(previous ? { cookie: previous.cookie } : {}), [header]: previous?.binding ?? 'signed-out' }, payload: { email, otp: codes.get(email)! } });
    expect(response.statusCode).toBe(200);
    const c = response.cookies.find(c => c.name.endsWith('.session_token'))!;
    const cookie = `${c.name}=${c.value}`;
    const current = await session(cookie);
    return { email, cookie, binding: current.sessionBinding as string, id: current.user.id as string };
  };
  const input = { externalEventName: 'Synthetic private central run', date: '2026-09-20', time: '24:31' };
  beforeAll(async () => {
    await new CatalogueImportService(db, 'beta').import({ format: '5k-compass-catalogue-v1', source: { namespace, kind: 'imported', attribution: 'Synthetic independent CENTRAL QA' }, records: [{ externalId: 'park', name: 'Central Synthetic Park', countryCode: 'GB', latitude: 53.4, longitude: -2.6, timezone: 'Europe/London', active: true }] });
    eventId = (await db.event.findUniqueOrThrow({ where: { sourceNamespace_externalId: { sourceNamespace: namespace, externalId: 'park' } } })).id;
    app = await buildApp({ config, store, authRuntime: { db, auth: createAuth(db, config, { async send(email, code) { codes.set(email, code); } }) }, now: () => new Date('2026-10-01T09:00:00Z'), logger: false });
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    await app?.close();
    await db.user.deleteMany({ where: { email: { contains: run } } });
    await db.verification.deleteMany({ where: { identifier: { contains: run } } });
    await db.emailAuthBudget.deleteMany({ where: { email: { contains: run } } });
    await db.rateLimit.deleteMany({ where: { key: { contains: run } } });
    await db.event.deleteMany({ where: { sourceNamespace: namespace } });
    await db.catalogueImportRun.deleteMany({ where: { sourceNamespace: namespace } });
    await db.$disconnect();
  });

  for (const replacement of ['another-account', 'same-account'] as const) {
    it(`rejects absent/stale bindings before contextual DB access after ${replacement} replacement`, async () => {
      const a = await login();
      const b = await login(replacement === 'same-account' ? a.email : undefined, a);
      expect(b.binding).not.toBe(a.binding);
      const created = await request({ method: 'POST', url: '/api/profile/performances', headers: { cookie: b.cookie, [header]: b.binding }, payload: input });
      expect(created.statusCode).toBe(201);
      const id = created.json().id;
      await db.userEvent.create({ data: { userId: b.id, eventId, favourite: true } });
      const snapshot = async () => ({
        users: await db.user.findMany({ where: { id: { in: [a.id, b.id] } }, orderBy: { id: 'asc' } }),
        performances: await db.userPerformance.findMany({ where: { userId: { in: [a.id, b.id] } }, orderBy: { id: 'asc' } }),
        favourites: await db.userEvent.findMany({ where: { userId: { in: [a.id, b.id] } }, orderBy: { eventId: 'asc' } }),
        sessions: await db.session.findMany({ where: { userId: { in: [a.id, b.id] } }, orderBy: { id: 'asc' } }),
        form: await db.runnerFormSnapshot.findMany({ where: { userId: { in: [a.id, b.id] } }, orderBy: { id: 'asc' } }),
      });
      const before = await snapshot();
      // Auth/session validation is necessarily allowed; personal handler data access is not.
      const spies = [vi.spyOn(store, 'getUser'), vi.spyOn(store, 'listUserPerformances'), vi.spyOn(store, 'getUserPerformance'), vi.spyOn(store, 'createUserPerformance'), vi.spyOn(store, 'updateUserPerformance'), vi.spyOn(store, 'deleteUserPerformance'), vi.spyOn(store, 'updateUserSettings'), vi.spyOn(store, 'getRunnerFormSnapshot'), vi.spyOn(store, 'listActiveEvents'), vi.spyOn(store, 'getEvent'), vi.spyOn(db.user, 'findUniqueOrThrow'), vi.spyOn(db.userEvent, 'findMany'), vi.spyOn(db, '$transaction')];
      const paths = ['/api/profile', '/api/profile/settings', '/api/profile/performances', `/api/profile/performances/${id}`, '/api/profile/current-form', '/api/profile/performance-summary', '/api/profile/explore-summary', '/api/profile/challenges', '/api/profile/challenges/alphabet', '/api/profile/challenges/alphabet/opportunities', `/api/profile/events/${eventId}/visits`, '/api/account/export', '/api/events', '/api/events/search?q=Central', '/api/events/nearby?lat=53.4&lon=-2.6', `/api/events/${eventId}`, `/api/events/${eventId}/history`, `/api/events/${eventId}/analytics`, `/api/events/${eventId}/placement?time=24:31`, '/api/placement?time=24:31', '/api/pb-finder', '/api/hidden-gems', `/api/compare?ids=${eventId}`, '/api/saturday/recommendations?intent=new_event&lat=53.4&lon=-2.6', '/api/planner?goal=new_event&lat=53.4&lon=-2.6', '/api/recommendations/best-pick?goal=new_event&lat=53.4&lon=-2.6'];
      const operations: InjectOptions[] = [
        ...paths.map(url => ({ url })),
        { method: 'PATCH', url: '/api/profile/settings', payload: { homeLabel: 'Stale overwrite', defaultTravelMinutes: 30 } },
        { method: 'POST', url: '/api/profile/performances', payload: { ...input, date: '2026-09-21' } },
        { method: 'PATCH', url: `/api/profile/performances/${id}`, payload: { ...input, time: '10:00' } },
        { method: 'DELETE', url: `/api/profile/performances/${id}` },
        { method: 'DELETE', url: '/api/account', payload: { confirmation: 'DELETE MY ACCOUNT' } },
      ];
      try {
        for (const binding of [undefined, a.binding, 'not-a-session']) for (const operation of operations) {
          const response = await request({ ...operation, headers: { cookie: b.cookie, ...(binding ? { [header]: binding } : {}) } });
          expect(response.statusCode, `${operation.method ?? 'GET'} ${operation.url} binding=${binding}`).toBe(409);
          expect(response.json().error.code).toBe('session_changed');
          expect(response.headers['set-cookie']).toBeUndefined();
          expect(response.body).not.toContain(b.email);
          expect(response.body).not.toContain(id);
        }
        for (const spy of spies) expect(spy).not.toHaveBeenCalled();
      } finally { vi.restoreAllMocks(); }
      expect(await snapshot()).toEqual(before);
      // Positive controls are separate, explicit originating bindings, never fixture auto-refresh.
      const exported = await request({ url: '/api/account/export', headers: { cookie: b.cookie, [header]: b.binding } });
      expect(exported.statusCode).toBe(200);
      expect(exported.json()).toMatchObject({ profile: { id: b.id }, favourites: [{ eventId }], performances: [{ id }] });
    });
  }

  it('rejects stale login/logout without consuming OTP, revoking the replacement, or emitting cookies', async () => {
    const a = await login(); const b = await login(undefined, a);
    const target = `central-qa-${run}-${++counter}@example.test`;
    expect((await send(target)).statusCode).toBe(200);
    const before = await db.session.findMany({ where: { userId: b.id } });
    const otp = await db.verification.findMany({ where: { identifier: `sign-in-otp-${target}` } });
    for (const binding of [undefined, a.binding, 'signed-out']) for (const path of ['/api/auth/sign-out', '/api/auth/sign-in/email-otp']) {
      const response = await request({ method: 'POST', url: path, headers: { cookie: b.cookie, ...(binding ? { [header]: binding } : {}) }, payload: path.endsWith('sign-out') ? {} : { email: target, otp: codes.get(target)! } });
      expect(response.statusCode).toBe(409); expect(response.json().error.code).toBe('session_changed');
      expect(response.headers['set-cookie']).toBeUndefined();
    }
    expect(await db.session.findMany({ where: { userId: b.id } })).toEqual(before);
    expect(await db.verification.findMany({ where: { identifier: `sign-in-otp-${target}` } })).toEqual(otp);
    expect((await session(b.cookie)).sessionBinding).toBe(b.binding);
    const out = await request({ method: 'POST', url: '/api/auth/sign-out', headers: { cookie: b.cookie, [header]: b.binding }, payload: {} });
    expect(out.statusCode).toBe(200);
    expect(out.cookies.find(c => c.name.endsWith('.session_token'))?.maxAge).toBe(0);
    expect((await session(b.cookie)).user).toBeNull();
    expect((await request({ url: '/api/profile' })).statusCode).toBe(401);
    expect((await request({ url: '/api/health' })).statusCode).toBe(200);
  });
});
