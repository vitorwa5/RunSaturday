import { randomUUID } from 'node:crypto';
import { CatalogueImportService } from '../catalogue/importService';
import type { CourseFactorResult } from '../analytics/courseSpeed';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance, InjectOptions } from 'fastify';
import { buildApp } from '../app';
import { createAuth } from '../auth/auth';
import { loadConfig } from '../config/env';
import { createPrismaClient } from '../db/prisma';
import { PrismaDataStore } from '../repositories/prisma/PrismaDataStore';
import { currentRunnerForm, computeUserRunnerForm } from '../services/runnerForm';
import { assertDemoSeedDatabase } from '../demo/seedGuard';

const url = process.env.TEST_DATABASE_URL;
const origin = 'http://localhost:5173';
const run = randomUUID();
const catalogueNamespace = `auth-fixture-${run}`;
let eventA = ''; let eventB = '';
// Explicit synthetic model fixtures for auth/form isolation only; not importer-created evidence.
const modelledFactors = (): CourseFactorResult[] => [eventA, eventB].map((eventId) => ({
  eventId, version: 'course_speed_v1', asOfDate: '2026-10-01', windowDays: 365,
  factor: 1, logFactor: 0, bootstrap: [0, 0], matchedRunners: 40, comparisons: 80,
  connectedEvents: 2, medianGapDays: 7, dispersion: 0, bootstrapHalfWidth: 0,
  latestComparison: '2026-09-26', confidence: { level: 'high', score: 100, factors: [] }, limitedReason: null,
}));
const config = () => loadConfig({ APP_MODE: 'beta', NODE_ENV: 'test', DATA_SOURCE: 'database', DATABASE_URL: url, AUTH_BASE_URL: origin, AUTH_ALLOW_INSECURE_LOCAL_HTTP: 'true', AUTH_SECRET: 'b1-test-only-secret-at-least-32-characters', EMAIL_TRANSPORT: 'test', LOG_LEVEL: 'silent' });

describe.skipIf(!url)('B1 PostgreSQL passwordless accounts and isolation', () => {
  const db = createPrismaClient(url!);
  const codes = new Map<string, string>();
  const store = new PrismaDataStore(db, 'demo_v0');
  let app: FastifyInstance;
  let auth: ReturnType<typeof createAuth>;
  let counter = 0;
  let ip = 1;
  const email = () => `auth-b1-${run}-${++counter}@example.test`;
  const req = (options: InjectOptions) => app.inject({ remoteAddress: `10.45.${Math.floor(ip / 250)}.${++ip % 250 + 1}`, ...options, headers: { origin, 'content-type': 'application/json', ...options.headers } });
  const send = (email: string) => req({ method: 'POST', url: '/api/auth/email-otp/send-verification-otp', payload: { email } });
  const verify = (email: string, otp: string, cookie?: string) => req({ method: 'POST', url: '/api/auth/sign-in/email-otp', payload: { email, otp }, headers: cookie ? { cookie } : {} });
  const cookieOf = (response: Awaited<ReturnType<typeof verify>>) => response.cookies.find((c) => c.name.endsWith('.session_token'))!;
  const login = async (address = email(), oldCookie?: string) => {
    expect((await send(address)).statusCode).toBe(200);
    const response = await verify(address, codes.get(address)!, oldCookie);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ success: true });
    const c = cookieOf(response);
    return { email: address, cookie: `${c.name}=${c.value}`, user: await db.user.findUniqueOrThrow({ where: { email: address } }), response };
  };
  const get = (path: string, cookie?: string) => req({ method: 'GET', url: path, headers: cookie ? { cookie } : {} });
  const mutation = (method: 'POST' | 'PATCH' | 'DELETE', path: string, cookie: string, payload?: object) => req({ method, url: path, headers: { cookie }, payload: payload ?? {} });
  const input = { get eventId() { return eventA; }, date: '2026-09-20', time: '19:35' };
  beforeAll(async () => {
    auth = createAuth(db, config(), { async send(email, code) { codes.set(email, code); } });
    app = await buildApp({ config: config(), store, authRuntime: { db, auth }, now: () => new Date('2026-10-01T09:00:00Z'), logger: false });
  });
  beforeEach(() => vi.restoreAllMocks());
  afterAll(async () => {
    await db.verification.deleteMany({ where: { identifier: { contains: run } } });
    await db.rateLimit.deleteMany({ where: { key: { contains: run } } });
    await db.emailAuthBudget.deleteMany({ where: { email: { contains: run } } });
    await db.user.deleteMany({ where: { email: { contains: run } } });
    await db.event.deleteMany({ where: { sourceNamespace: catalogueNamespace } });
    await db.catalogueImportRun.deleteMany({ where: { sourceNamespace: catalogueNamespace } });
    await app?.close();
    await db.$disconnect();
  });

  it('verifies normalized email once, creates an empty persistent user and sets an opaque HttpOnly cookie', async () => {
    const e = email();
    expect((await send(`  ${e.toUpperCase()}  `)).statusCode).toBe(200);
    const record = await db.verification.findFirstOrThrow({ where: { identifier: `sign-in-otp-${e}` } });
    expect(record.value).not.toContain(codes.get(e));
    expect(await db.user.findUnique({ where: { email: e } })).toBeNull();
    const res = await verify(e, codes.get(e)!);
    expect(res.statusCode).toBe(200);
    const c = cookieOf(res); const cookie = `${c.name}=${c.value}`;
    expect(c.httpOnly).toBe(true); expect(c.sameSite).toBe('Lax'); expect(c.path).toBe('/'); expect(c.maxAge).toBe(604800);
    expect(c.secure).toBeFalsy(); expect(c.name).toBe('5k-compass.session_token');
    expect(res.json()).toEqual({ success: true });
    expect((await verify(e, codes.get(e)!)).statusCode).toBe(400);
    const user = await db.user.findUniqueOrThrow({ where: { email: e } });
    expect(user.emailVerified).toBe(true); expect(user.isDemo).toBe(false);
    expect((await get('/api/profile', cookie)).json()).toMatchObject({ id: user.id, runsCompleted: 0, uniqueEventsVisited: 0, lifetimePbSeconds: null, recentPbSeconds: null, savedEventIds: [], currentForm: { status: 'unavailable' } });
    expect((await get('/api/profile/challenges', cookie)).json().challenges.find((c: { id: string }) => c.id === 'alphabet').progress).toMatchObject({ current: 0, target: 25 });
    expect((await get('/api/events', cookie)).json().every((e: { visited: boolean; favourite: boolean }) => !e.visited && !e.favourite)).toBe(true);
    const sat = await get('/api/saturday/recommendations?intent=new_event&lat=53.4&lon=-2.6', cookie);
    expect(sat.statusCode).toBe(200);
    expect(JSON.stringify(sat.json())).not.toContain('demo-user');
    expect(sat.json().results.length).toBeGreaterThan(0);
    for (const intent of ['pb', 'place']) {
      const response = await get(`/api/saturday/recommendations?intent=${intent}&lat=53.4&lon=-2.6`, cookie);
      expect(response.statusCode).toBe(200);
      expect(response.json().ability.usesCurrentForm).toBe(false);
      expect(response.json().limitations.join(' ')).toContain('Current Form unavailable');
    }
    const currentForm = await get(`/api/compare?ids=${eventA},${eventB}&basis=current_form`, cookie);
    expect(currentForm.statusCode).toBe(409);
  });

  it('rejects invalid, expired, replayed and concurrently reused codes', async () => {
    const e = email(); await send(e);
    expect((await verify(e, codes.get(e) === '000000' ? '111111' : '000000')).statusCode).toBe(400);
    await db.verification.updateMany({ where: { identifier: `sign-in-otp-${e}` }, data: { expiresAt: new Date(0) } });
    expect((await verify(e, codes.get(e)!)).statusCode).toBe(400);
    expect(await db.user.findUnique({ where: { email: e } })).toBeNull();
    await send(e);
    const responses = await Promise.all([verify(e, codes.get(e)!), verify(e, codes.get(e)!)]);
    expect(responses.map((r) => r.statusCode).sort()).toEqual([200, 400]);
  });

  it('exhausts per-code retries and rotates codes on resend', async () => {
    const e = email(); await send(e); const code = codes.get(e)!;
    const wrong = code === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++) expect((await verify(e, wrong)).statusCode).toBe(400);
    expect((await verify(e, code)).statusCode).toBe(403);
    await send(e);
    expect((await verify(e, codes.get(e)!)).statusCode).toBe(200);
  });

  it('limits per-email resends across IPs and ignores spoofed client-IP headers', async () => {
    const e = email();
    for (let i = 0; i < 5; i++) expect((await send(e)).statusCode).toBe(200);
    expect((await send(e)).statusCode).toBe(429);
    const e2 = email();
    let limited = false;
    for (let i = 0; i < 12; i++) {
      const r = await req({ remoteAddress: '10.99.99.99', method: 'POST', url: '/api/auth/sign-in/email-otp', headers: { 'x-compass-client-ip': `10.8.8.${i}` }, payload: { email: `${i}-${e2}`, otp: '123456' } });
      limited ||= r.statusCode === 429;
    }
    expect(limited).toBe(true);
  });

  it('rejects malformed requests, unverified/demo identities, expired and revoked sessions', async () => {
    expect((await send('not-email')).statusCode).toBe(400);
    expect((await verify(email(), 'bad')).statusCode).toBe(400);
    expect((await get('/api/profile')).statusCode).toBe(401);
    expect((await get('/api/profile/current-form')).statusCode).toBe(401);
    expect((await get('/api/events')).statusCode).toBe(200);
    expect((await get('/api/auth/get-session')).statusCode).toBe(404);
    const a = await login();
    await db.user.update({ where: { id: a.user.id }, data: { emailVerified: false } });
    expect((await get('/api/profile', a.cookie)).statusCode).toBe(401);
    await db.user.update({ where: { id: a.user.id }, data: { emailVerified: true, isDemo: true } });
    expect((await get('/api/profile', a.cookie)).statusCode).toBe(401);
    await db.user.update({ where: { id: a.user.id }, data: { isDemo: false } });
    await db.session.updateMany({ where: { userId: a.user.id }, data: { expiresAt: new Date(0) } });
    expect((await get('/api/profile', a.cookie)).statusCode).toBe(401);
    const b = await login(); await db.session.deleteMany({ where: { userId: b.user.id } });
    expect((await get('/api/profile', b.cookie)).statusCode).toBe(401);
  });

  it('prevents fixation, revokes the replaced session, logs out and clears its cookie', async () => {
    const a = await login(); const b = await login(a.email, a.cookie);
    expect(b.cookie).not.toBe(a.cookie);
    expect((await get('/api/profile', a.cookie)).statusCode).toBe(401);
    const out = await mutation('POST', '/api/auth/sign-out', b.cookie, {});
    expect(out.statusCode).toBe(200); expect(cookieOf(out).maxAge).toBe(0);
    expect((await get('/api/profile', b.cookie)).statusCode).toBe(401);
    expect(await db.session.count({ where: { userId: a.user.id } })).toBe(0);
  });

  it('returns identity and expiry from one authoritative session read, never mixed across two reads', async () => {
    const a = await login();
    const validated = await auth.api.getSession({ headers: new Headers({ cookie: a.cookie }) });
    expect(validated).not.toBeNull();
    const lookup = vi.spyOn(auth.api, 'getSession').mockResolvedValueOnce(validated).mockResolvedValueOnce(null);
    const signedIn = (await get('/api/account/session', a.cookie)).json();
    expect(lookup).toHaveBeenCalledTimes(1);
    expect(signedIn).toEqual({ mode: 'beta', user: { id: a.user.id, email: a.email }, expiresAt: validated!.session.expiresAt.toISOString() });
    expect((await get('/api/account/session', a.cookie)).json()).toEqual({ mode: 'beta', user: null });
    expect(lookup).toHaveBeenCalledTimes(2);
  });

  it('keeps an active/approaching-expiry session fixed and rejects it after expiry', async () => {
    const a = await login();
    const issued = await db.session.findFirstOrThrow({ where: { userId: a.user.id } });
    expect(issued.expiresAt.getTime() - issued.createdAt.getTime()).toBeCloseTo(604_800_000, -3);
    const expiresAt = new Date(Date.now() + 120_000);
    await db.session.update({ where: { id: issued.id }, data: { expiresAt, updatedAt: new Date(Date.now() - 172_800_000) } });
    expect((await get('/api/account/session', a.cookie)).json().expiresAt).toBe(expiresAt.toISOString());
    expect((await get('/api/profile', a.cookie)).statusCode).toBe(200);
    expect((await db.session.findUniqueOrThrow({ where: { id: issued.id } })).expiresAt).toEqual(expiresAt);
    const near = new Date(Date.now() + 10_000);
    await db.session.update({ where: { id: issued.id }, data: { expiresAt: near } });
    expect((await get('/api/account/session', a.cookie)).json().expiresAt).toBe(near.toISOString());
    expect((await db.session.findUniqueOrThrow({ where: { id: issued.id } })).expiresAt).toEqual(near);
    await db.session.update({ where: { id: issued.id }, data: { expiresAt: new Date(0) } });
    expect((await get('/api/profile', a.cookie)).statusCode).toBe(401);
    expect((await get('/api/account/session', a.cookie)).json().user).toBeNull();
  });

  it('exports recorded facts despite a Current Form outage and refuses demo seeding with a real account', async () => {
    const a = await login();
    await mutation('POST', '/api/profile/performances', a.cookie, input);
    await assertDemoSeedDatabase(db).then(() => { throw new Error('seed must refuse'); }, (error) => expect(error.message).toContain('refused'));
    await db.runnerFormSnapshot.deleteMany({ where: { userId: a.user.id } });
    vi.spyOn(store, 'listCourseFactors').mockRejectedValue(new Error('private factor outage'));
    const response = await get('/api/account/export', a.cookie);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ profile: { id: a.user.id }, performances: [{ finishTimeSeconds: 1175 }],
      summaries: { performance: { totalPerformances: 1 }, currentForm: null }, derivedStatus: { currentForm: { status: 'error', code: 'calculation_unavailable', asOfDate: '2026-10-01' } } });
    expect(response.body).not.toContain('private factor outage');
    expect(await db.userPerformance.count({ where: { userId: a.user.id } })).toBe(1);
  });

  it('does not claim logout or clear the retry cookie when persistent revocation fails', async () => {
    const a = await login();
    const otherSession = await login(a.email);
    const failure = vi.spyOn(db.session, 'deleteMany').mockRejectedValueOnce(new Error('private database failure'));
    const out = await mutation('POST', '/api/auth/sign-out', a.cookie);
    expect(out.statusCode).toBe(503);
    expect(out.json().error.code).toBe('logout_unavailable');
    expect(out.body).not.toContain('private database failure');
    expect(out.headers['set-cookie']).toBeUndefined();
    expect(await db.session.count({ where: { userId: a.user.id } })).toBe(2);
    expect((await get('/api/profile', a.cookie)).statusCode).toBe(200);
    failure.mockRestore();

    const retry = await mutation('POST', '/api/auth/sign-out', a.cookie);
    expect(retry.statusCode).toBe(200);
    expect(cookieOf(retry).maxAge).toBe(0);
    expect(await db.session.count({ where: { userId: a.user.id } })).toBe(1);
    // A copied cookie, not the cleared browser cookie, must be unusable.
    expect((await get('/api/profile', a.cookie)).statusCode).toBe(401);
    expect((await get('/api/profile', otherSession.cookie)).statusCode).toBe(200);
    expect((await mutation('POST', '/api/auth/sign-out', a.cookie)).statusCode).toBe(200);
  });

  it('handles absent, forged and expired sessions idempotently at logout', async () => {
    for (const cookie of ['', '5k-compass.session_token=forged']) {
      const out = await mutation('POST', '/api/auth/sign-out', cookie);
      expect(out.statusCode).toBe(200);
      expect(cookieOf(out).maxAge).toBe(0);
    }
    const a = await login();
    await db.session.updateMany({ where: { userId: a.user.id }, data: { expiresAt: new Date(0) } });
    expect((await mutation('POST', '/api/auth/sign-out', a.cookie)).statusCode).toBe(200);
    expect(await db.session.count({ where: { userId: a.user.id } })).toBe(0);
    expect((await get('/api/profile', a.cookie)).statusCode).toBe(401);
  });

  it('blocks missing/foreign origins on login and authenticated mutations', async () => {
    const a = await login();
    for (const foreign of [undefined, 'https://evil.example']) {
      const r = await app.inject({ method: 'POST', url: '/api/profile/performances', headers: { cookie: a.cookie, ...(foreign ? { origin: foreign } : {}) }, payload: input });
      expect(r.statusCode).toBe(403);
      const logout = await app.inject({ method: 'POST', url: '/api/auth/sign-out', headers: { cookie: a.cookie, ...(foreign ? { origin: foreign } : {}) }, payload: {} });
      expect(logout.statusCode).toBe(403);
      expect(logout.headers['set-cookie']).toBeUndefined();
    }
    expect((await get('/api/profile', a.cookie)).statusCode).toBe(200);
    expect((await req({ method: 'POST', url: '/api/auth/email-otp/send-verification-otp', headers: { origin: 'https://evil.example' }, payload: { email: email() } })).statusCode).toBe(403);
    expect((await req({ method: 'POST', url: '/api/profile/performances', headers: { cookie: a.cookie, 'sec-fetch-site': 'cross-site' }, payload: input })).statusCode).toBe(403);
    expect(await db.userPerformance.count({ where: { userId: a.user.id } })).toBe(0);
  });

  it('sets Secure production cookies and keeps provider failures free of credentials', async () => {
    const secureOrigin = 'https://5k.example';
    const secureConfig = loadConfig({ ...config(), CORS_ORIGINS: secureOrigin, NODE_ENV: 'production', AUTH_BASE_URL: secureOrigin, AUTH_ALLOW_INSECURE_LOCAL_HTTP: 'false', EMAIL_TRANSPORT: 'resend', EMAIL_API_KEY: 'test-key', EMAIL_FROM: 'auth@example.test' } as unknown as NodeJS.ProcessEnv);
    const db2 = createPrismaClient(url!);
    const app2 = await buildApp({ config: secureConfig, store: new PrismaDataStore(db2, 'demo_v0'), authRuntime: { db: db2, auth: createAuth(db2, secureConfig, { async send(email, code) { codes.set(email, code); } }) }, logger: false });
    const e = email();
    try {
      const headers = { origin: secureOrigin, 'content-type': 'application/json' };
      expect((await app2.inject({ method: 'POST', url: '/api/auth/email-otp/send-verification-otp', headers, payload: { email: e } })).statusCode).toBe(200);
      const response = await app2.inject({ method: 'POST', url: '/api/auth/sign-in/email-otp', headers, payload: { email: e, otp: codes.get(e)! } });
      expect(response.statusCode).toBe(200);
      const c = cookieOf(response);
      expect(c.secure).toBe(true); expect(c.httpOnly).toBe(true); expect(c.sameSite).toBe('Lax'); expect(c.name).toBe('__Secure-5k-compass.session_token');
      expect(response.body).not.toContain(codes.get(e)); expect(response.body).not.toContain(c.value);
      const failed = email();
      vi.spyOn(codes, 'set').mockImplementationOnce(() => { throw new Error('provider credential and code must never be forwarded'); });
      const result = await app2.inject({ method: 'POST', url: '/api/auth/email-otp/send-verification-otp', headers, payload: { email: failed } });
      expect(result.statusCode).toBeGreaterThanOrEqual(400);
      expect(result.body).not.toContain('provider credential');
    } finally { await app2.close(); }
  });

  it('uses Secure beta cookies with NODE_ENV omitted and clears the matching cookie at logout/deletion', async () => {
    const secureOrigin = 'https://example.com';
    const secureConfig = loadConfig({ APP_MODE: 'beta', DATABASE_URL: url, AUTH_BASE_URL: secureOrigin, AUTH_SECRET: 'b1-test-only-secret-at-least-32-characters', EMAIL_TRANSPORT: 'resend', EMAIL_API_KEY: 'test-key', EMAIL_FROM: 'auth@example.test', LOG_LEVEL: 'silent' });
    expect(secureConfig.NODE_ENV).toBe('development');
    const db2 = createPrismaClient(url!);
    const app2 = await buildApp({ config: secureConfig, store: new PrismaDataStore(db2, 'demo_v0'), authRuntime: { db: db2, auth: createAuth(db2, secureConfig, { async send(email, code) { codes.set(email, code); } }) }, logger: false });
    const request = (method: 'POST' | 'DELETE', path: string, payload: object, cookie?: string) => app2.inject({ method, url: path, headers: { origin: secureOrigin, 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, payload });
    try {
      for (const ending of ['logout', 'delete'] as const) {
        const e = email();
        expect((await request('POST', '/api/auth/email-otp/send-verification-otp', { email: e })).statusCode).toBe(200);
        const login = await request('POST', '/api/auth/sign-in/email-otp', { email: e, otp: codes.get(e)! });
        expect(login.statusCode).toBe(200);
        const c = cookieOf(login);
        expect(c.secure).toBe(true);
        expect(c.name).toBe('__Secure-5k-compass.session_token');
        const cookie = `${c.name}=${c.value}`;
        const out = ending === 'logout'
          ? await request('POST', '/api/auth/sign-out', {}, cookie)
          : await request('DELETE', '/api/account', { confirmation: 'DELETE MY ACCOUNT' }, cookie);
        expect(out.statusCode).toBe(ending === 'logout' ? 200 : 204);
        expect(cookieOf(out)).toMatchObject({ name: c.name, secure: true, httpOnly: true, path: '/', sameSite: 'Lax', maxAge: 0 });
        expect((await app2.inject({ url: '/api/profile', headers: { cookie } })).statusCode).toBe(401);
      }
    } finally { await app2.close(); }
  });

  it('isolates overlapping histories, PBs, form, favourites, visits, challenges, event history and all personalised tools', async () => {
    vi.spyOn(store, 'listCourseFactors').mockResolvedValue(modelledFactors());
    const a = await login(); const b = await login();
    const aRun = await mutation('POST', '/api/profile/performances', a.cookie, { ...input, userId: b.user.id });
    const bRun = await mutation('POST', '/api/profile/performances', b.cookie, { ...input, time: '25:00' });
    expect(aRun.statusCode).toBe(201); expect(bRun.statusCode).toBe(201);
    const id = bRun.json().id;
    expect((await get(`/api/profile/performances/${id}`, a.cookie)).statusCode).toBe(404);
    expect((await mutation('PATCH', `/api/profile/performances/${id}`, a.cookie, input)).statusCode).toBe(404);
    expect((await mutation('DELETE', `/api/profile/performances/${id}`, a.cookie)).statusCode).toBe(404);
    const aList = (await get(`/api/profile/performances?userId=${b.user.id}`, a.cookie)).json();
    expect(aList.total).toBe(1); expect(aList.performances[0].id).toBe(aRun.json().id);
    await db.userEvent.create({ data: { userId: b.user.id, eventId: `${eventB}`, favourite: true } });
    const profileA = (await get('/api/profile', a.cookie)).json(); const profileB = (await get('/api/profile', b.cookie)).json();
    expect(profileA).toMatchObject({ id: a.user.id, lifetimePbSeconds: 1175, recentPbSeconds: 1175, savedEventIds: [] });
    expect(profileB).toMatchObject({ id: b.user.id, lifetimePbSeconds: 1500, savedEventIds: [`${eventB}`] });
    expect(profileA.currentForm.inputs.every((p: { performanceId: string }) => p.performanceId !== id)).toBe(true);
    expect(profileA.currentForm.inputs).toHaveLength(1);
    expect(profileA.currentForm.inputs[0].performanceId).toBe(aRun.json().id);
    expect(profileB.currentForm.inputs[0].performanceId).toBe(id);
    // Add B-only history: its visits/challenges/form cannot enter A's responses.
    await mutation('POST', '/api/profile/performances', b.cookie, { ...input, eventId: `${eventB}`, date: '2026-09-13' });
    for (const path of ['/api/profile/explore-summary', '/api/profile/challenges', '/api/profile/current-form', '/api/profile/performance-summary', `/api/profile/events/${eventB}/visits`, `/api/events/${eventB}`, '/api/events', '/api/pb-finder', '/api/hidden-gems', `/api/compare?ids=${eventA},${eventB}`, '/api/saturday/recommendations?intent=new_event&lat=53.4&lon=-2.6', '/api/planner?goal=new_event&lat=53.4&lon=-2.6', '/api/recommendations/best-pick?goal=new_event&lat=53.4&lon=-2.6']) {
      const response = await get(path, a.cookie);
      expect(response.statusCode, path).toBe(200);
      expect(response.body, path).not.toContain(b.user.id);
      expect(response.body, path).not.toContain(id);
    }
    expect((await get(`/api/profile/events/${eventB}/visits`, a.cookie)).json()).toMatchObject({ visited: false, visitCount: 0, pbSeconds: null });
    expect((await get(`/api/profile/events/${eventB}/visits`, b.cookie)).json()).toMatchObject({ visited: true, visitCount: 1, pbSeconds: 1175 });
    expect((await get('/api/profile/challenges', a.cookie)).body).not.toEqual((await get('/api/profile/challenges', b.cookie)).body);
    expect((await get(`/api/events/${eventB}`, a.cookie)).json()).toMatchObject({ favourite: false, visited: false });
    expect((await get(`/api/events/${eventB}`, b.cookie)).json()).toMatchObject({ favourite: true, visited: true });
    const saturdayPath = '/api/saturday/recommendations?intent=new_event&lat=53.4&lon=-2.6&maxTravel=90';
    const [saturdayA, saturdayB] = await Promise.all([get(saturdayPath, a.cookie), get(saturdayPath, b.cookie)]);
    const ids = (response: typeof saturdayA) => response.json().results.map((r: { event: { id: string } }) => r.event.id);
    expect(ids(saturdayA)).toContain(`${eventB}`);
    expect(ids(saturdayB)).not.toContain(`${eventB}`);
    // Overlapping asynchronous handlers must retain their own identity.
    const simultaneous = await Promise.all(Array.from({ length: 12 }, (_, i) => get('/api/profile', i % 2 === 0 ? a.cookie : b.cookie)));
    simultaneous.forEach((response, i) => expect(response.json().id).toBe(i % 2 === 0 ? a.user.id : b.user.id));
  });

  it('keeps persistent identity and data after rebuilding the application with a new database connection', async () => {
    const a = await login(); await mutation('POST', '/api/profile/performances', a.cookie, input);
    const db2 = createPrismaClient(url!); const app2 = await buildApp({ config: config(), store: new PrismaDataStore(db2, 'demo_v0'), authRuntime: { db: db2, auth: createAuth(db2, config(), { async send() {} }) }, logger: false });
    try {
      const response = await app2.inject({ url: '/api/profile', headers: { cookie: a.cookie } });
      expect(response.json()).toMatchObject({ id: a.user.id, runsCompleted: 1, lifetimePbSeconds: 1175 });
    } finally { await app2.close(); }
  });

  it('invalidates all snapshot versions atomically and never serves stale form if recomputation fails', async () => {
    const factors = vi.spyOn(store, 'listCourseFactors').mockResolvedValue(modelledFactors());
    const a = await login(); await mutation('POST', '/api/profile/performances', a.cookie, input);
    const old = await currentRunnerForm(store, a.user.id, '2026-10-01'); const revision = await store.getPerformanceRevision(a.user.id);
    await store.saveRunnerFormSnapshot(a.user.id, { ...old, asOfDate: '2026-09-30', version: 'old-personal-version' });
    factors.mockRejectedValue(new Error('factor outage'));
    const result = await mutation('PATCH', `/api/profile/performances/${(await get('/api/profile/performances', a.cookie)).json().performances[0].id}`, a.cookie, { ...input, time: '22:00' });
    expect(result.statusCode).toBe(200);
    expect(await db.runnerFormSnapshot.count({ where: { userId: a.user.id } })).toBe(0);
    expect((await get('/api/profile/current-form', a.cookie)).statusCode).toBe(503);
    factors.mockResolvedValue(modelledFactors());
    expect(await store.saveRunnerFormSnapshot(a.user.id, old, revision)).toBe(false);
    const fresh = await currentRunnerForm(store, a.user.id, '2026-10-01');
    expect(fresh.inputs[0]!.actualSeconds).toBe(1320);
  });

  it('exports only owned data, deletes every canonical/derived/auth row and revokes all sessions', async () => {
    const a = await login(); const second = await login(a.email); const b = await login();
    await mutation('POST', '/api/profile/performances', a.cookie, input);
    await mutation('POST', '/api/profile/performances', b.cookie, { ...input, time: '30:00' });
    await db.userEvent.create({ data: { userId: a.user.id, eventId: input.eventId, favourite: true } });
    const old = await computeUserRunnerForm(store, a.user.id, '2026-09-30'); await store.saveRunnerFormSnapshot(a.user.id, old);
    await db.account.create({ data: { userId: a.user.id, accountId: a.user.id, providerId: 'test-identity' } });
    await send(a.email);
    await db.rateLimit.create({ data: { key: `email:${a.email}:send`, count: 5, lastRequest: BigInt(Date.now()) } });
    const exported = (await get('/api/account/export', a.cookie)).json();
    expect(exported.profile.id).toBe(a.user.id); expect(exported.performances).toHaveLength(1); expect(exported.favourites).toHaveLength(1); expect(exported.derivedSnapshots).toHaveLength(2);
    expect(JSON.stringify(exported)).not.toContain(b.user.id); expect(JSON.stringify(exported)).not.toContain('session_token'); expect(exported.results).toBeUndefined();
    expect((await mutation('DELETE', '/api/account', a.cookie, { confirmation: 'no' })).statusCode).toBe(400);
    expect((await mutation('DELETE', '/api/account', a.cookie, { confirmation: 'DELETE MY ACCOUNT' })).statusCode).toBe(204);
    expect(await db.user.findUnique({ where: { id: a.user.id } })).toBeNull();
    for (const model of [db.userPerformance, db.userEvent, db.runnerFormSnapshot, db.session, db.account]) expect(await (model.count as (a: unknown) => Promise<number>)({ where: { userId: a.user.id } })).toBe(0);
    expect(await db.verification.count({ where: { identifier: `sign-in-otp-${a.email}` } })).toBe(0);
    expect(await db.emailAuthBudget.count({ where: { email: a.email } })).toBe(0);
    expect(await db.rateLimit.count({ where: { key: `email:${a.email}:send` } })).toBe(0);
    expect((await get('/api/profile', second.cookie)).statusCode).toBe(401);
    expect((await get('/api/profile', b.cookie)).json()).toMatchObject({ id: b.user.id, runsCompleted: 1 });
  });
});
