import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CatalogueImportService, catalogueSlug } from '../catalogue/importService';
import { CatalogueInputError } from '../catalogue/schema';
import { createPrismaClient } from '../db/prisma';
import { PrismaDataStore, queryCompetitionInputs, queryPerformances } from '../repositories/prisma/PrismaDataStore';
import { recalculateAnalytics } from '../analytics/recalculate';
import { loadUser } from '../services/userPerformance';
import { loadExploreState } from '../services/explore';
import { currentRunnerForm } from '../services/runnerForm';
import { buildApp } from '../app';
import { loadConfig } from '../config/env';
import { createAuth } from '../auth/auth';
import { RUNNER_FORM_VERSION } from '../analytics/versions';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const url = process.env.TEST_DATABASE_URL;
describe.skipIf(!url)('B2A catalogue import and PostgreSQL provenance boundaries', () => {
  const db = createPrismaClient(url!);
  const run = randomUUID(); const namespaces = new Set<string>(); const legacyIds: string[] = [];
  const userId = `catalogue-test-${run}`;
  const importer = new CatalogueImportService(db, 'beta', () => new Date('2026-10-03T10:00:00Z'));
  const store = new PrismaDataStore(db, 'demo_v0'); // Safe default is imported-only beta.
  const source = (name: string) => { const namespace = `catalogue-test-${run}-${name}`; namespaces.add(namespace); return { namespace, kind: 'imported' as const, attribution: 'Synthetic integration-test fixture', referenceUrl: 'https://example.test/catalogue', licence: 'Synthetic test data only' }; };
  const record = (externalId = '0007') => ({ externalId, name: 'Synthetic Aster Saturday 5K', countryCode: 'GB', region: 'Scotland', latitude: 56.1, longitude: -3.2, timezone: 'Europe/London', active: true });
  const envelope = (s: ReturnType<typeof source>, records: unknown[]) => ({ format: '5k-compass-catalogue-v1', source: s, records });
  const find = (namespace: string, externalId = '0007') => db.event.findUniqueOrThrow({ where: { sourceNamespace_externalId: { sourceNamespace: namespace, externalId } } });
  beforeAll(async () => { await db.user.create({ data: { id: userId, displayName: 'Catalogue test owner', isDemo: false } }); });
  afterAll(async () => {
    await db.user.deleteMany({ where: { OR: [{ id: userId }, { email: { contains: run } }] } });
    await db.verification.deleteMany({ where: { identifier: { contains: run } } });
    await db.emailAuthBudget.deleteMany({ where: { email: { contains: run } } });
    await db.event.deleteMany({ where: { OR: [{ sourceNamespace: { in: [...namespaces] } }, { id: { in: legacyIds } }] } });
    await db.catalogueImportRun.deleteMany({ where: { sourceNamespace: { in: [...namespaces] } } });
    await db.$disconnect();
  });

  it('creates immutable internal identity/provenance, preserves unknown facts and reimports idempotently', async () => {
    const s = source('idempotent'); const input = envelope(s, [record()]);
    const first = await importer.import(input);
    expect(first).toMatchObject({ received: 1, created: 1, updated: 0, unchanged: 0, rejected: 0, deactivated: 0, dryRun: false });
    const event = await find(s.namespace);
    expect(event.id).not.toBe('0007'); expect(event.slug).not.toContain('Aster');
    expect(event).toMatchObject({ source: 'IMPORTED', externalId: '0007', sourceAttribution: s.attribution, sourceUrl: s.referenceUrl, sourceLicence: s.licence,
      countryCode: 'GB', country: 'United Kingdom', timezone: 'Europe/London', region: 'Scotland', town: null, startTime: null, courseType: 'UNKNOWN', surface: 'UNKNOWN', laps: null, elevationM: null, catalogueImportRunId: first.runId });
    expect(event.importedAt?.toISOString()).toBe('2026-10-03T10:00:00.000Z'); expect(event.sourceUpdatedAt).toBeNull();
    expect(await db.eventOccurrence.count({ where: { eventId: event.id } })).toBe(0);
    expect(await db.eventScore.count({ where: { eventId: event.id } })).toBe(0);
    expect(await db.courseFactorSnapshot.count({ where: { eventId: event.id } })).toBe(0);
    const second = await importer.import(input);
    expect(second).toMatchObject({ received: 1, created: 0, updated: 0, unchanged: 1, deactivated: 0, rejected: 0 });
    expect((await find(s.namespace)).id).toBe(event.id);
    expect(await db.event.count({ where: { sourceNamespace: s.namespace } })).toBe(1);
    expect(await db.catalogueImportRun.findUniqueOrThrow({ where: { id: second.runId! } })).toMatchObject({ received: 1, created: 0, unchanged: 1, rejected: 0 });
  });

  it('rejects repeated identities in one file and separates two providers with the same external ID', async () => {
    const a = source('provider-a'); const b = source('provider-b');
    const result = await importer.import(envelope(a, [record('same'), record('same')]));
    expect(result).toMatchObject({ received: 2, created: 1, rejected: 1 });
    expect(result.rejections).toMatchObject([{ index: 1, externalId: 'same', issues: [{ code: 'duplicate_external_id' }] }]);
    await importer.import(envelope(b, [record('same')]));
    const event = await find(a.namespace, 'same'); expect((await find(b.namespace, 'same')).id).not.toBe(event.id);
    // A different id AND slug isolates the database's external-identity unique constraint.
    await expect(db.event.create({ data: { ...event, id: `duplicate-${run}`, slug: `duplicate-slug-${run}` } })).rejects.toMatchObject({ code: 'P2002' });
    expect(await db.event.count({ where: { sourceNamespace: a.namespace } })).toBe(1);
  });

  it('updates names, location, URLs and provenance without changing internal identity or deleting referenced inactive events', async () => {
    const s = source('lifecycle'); await importer.import(envelope(s, [record()])); const original = await find(s.namespace);
    await db.userPerformance.create({ data: { userId, eventId: original.id, date: new Date('2026-09-26'), finishTimeSeconds: 1200, duplicateKey: `event:${original.id}|2026-09-26|5000` } });
    const updated = { ...record(), name: 'Synthetic Birch Saturday 5K', town: 'Fictional town', latitude: 55.5, longitude: -3.5, region: 'Wales', subdivisionCode: 'GB-WLS', officialUrl: 'https://example.test/renamed', sourceUrl: 'https://example.test/source/7', sourceUpdatedAt: '2026-10-02T12:00:00+01:00', startTime: '09:30' };
    expect(await importer.import(envelope({ ...s, attribution: 'Corrected synthetic attribution' }, [updated]))).toMatchObject({ updated: 1, deactivated: 0 });
    expect(await find(s.namespace)).toMatchObject({ id: original.id, slug: original.slug, name: updated.name, latitude: 55.5, region: 'Wales', sourceAttribution: 'Corrected synthetic attribution', officialUrl: updated.officialUrl, startTime: '09:30' });
    expect(await importer.import(envelope(s, [{ ...updated, active: false }]))).toMatchObject({ created: 0, updated: 0, deactivated: 1 });
    expect((await find(s.namespace)).active).toBe(false);
    expect(await db.userPerformance.count({ where: { userId, eventId: original.id } })).toBe(1);
    expect(await store.getEvent(original.id, '2026-10-03')).toMatchObject({ id: original.id, active: false });
    expect(await store.listActiveEvents({ sourceNamespace: s.namespace })).toEqual([]);
    await expect(db.event.delete({ where: { id: original.id } })).rejects.toMatchObject({ code: 'P2003' });
    // This is a delta contract: absent records never imply destructive removal.
    await importer.import(envelope(s, [])); expect(await find(s.namespace)).toMatchObject({ id: original.id, active: false });
  });

  it('quarantines invalid records with structured reasons and does not persist their payloads', async () => {
    const s = source('invalid');
    const result = await importer.import(envelope(s, [{ ...record('bad-coordinates'), latitude: 91 }, { ...record('bad-zone'), timezone: 'Imaginary/Place' }, { ...record('bad-country'), countryCode: 'XX' }]));
    expect(result).toMatchObject({ received: 3, rejected: 3, created: 0 });
    expect(result.rejections.map((r) => r.issues[0]!.path)).toEqual(['latitude', 'timezone', 'countryCode']);
    expect(await db.event.count({ where: { sourceNamespace: s.namespace } })).toBe(0);
    const audit = await db.catalogueImportRun.findUniqueOrThrow({ where: { id: result.runId! } });
    expect(audit).toMatchObject({ received: 3, rejected: 3 }); expect(JSON.stringify(audit.rejections)).not.toContain('Imaginary/Place');
    await expect(importer.import(envelope({ ...s, namespace: 'INVALID' }, [record()]))).rejects.toBeInstanceOf(CatalogueInputError);
  });

  it('dry runs validate and compute create/update/rejection counts without writing events or audit runs', async () => {
    const s = source('dry-run'); await importer.import(envelope(s, [record()]));
    const event = await find(s.namespace); const runs = await db.catalogueImportRun.count({ where: { sourceNamespace: s.namespace } });
    expect(await importer.import(envelope(s, [{ ...record(), name: 'Synthetic corrected name' }, record('new'), { ...record('invalid'), longitude: 181 }]), { dryRun: true })).toMatchObject({ runId: null, dryRun: true, received: 3, updated: 1, created: 1, rejected: 1 });
    expect(await find(s.namespace)).toEqual(event); expect(await db.event.count({ where: { sourceNamespace: s.namespace } })).toBe(1);
    expect(await db.catalogueImportRun.count({ where: { sourceNamespace: s.namespace } })).toBe(runs);
  });

  it('executes the local JSON CLI with a genuine dry run and idempotent persisted re-import', async () => {
    const s = source('cli'); const dir = await mkdtemp(join(tmpdir(), 'runsaturday-catalogue-'));
    const path = join(dir, 'synthetic.json');
    try {
      await writeFile(path, JSON.stringify(envelope(s, [record()])));
      const command = async (dryRun = false) => JSON.parse((await promisify(execFile)(process.execPath,
        [resolve('../../node_modules/tsx/dist/cli.mjs'), 'scripts/import-catalogue.ts', '--file', path, ...(dryRun ? ['--dry-run'] : [])],
        { env: { ...process.env, APP_MODE: 'beta', DATABASE_URL: url! }, timeout: 20_000 })).stdout);
      expect(await command(true)).toMatchObject({ dryRun: true, runId: null, received: 1, created: 1 });
      expect(await db.event.count({ where: { sourceNamespace: s.namespace } })).toBe(0);
      expect(await db.catalogueImportRun.count({ where: { sourceNamespace: s.namespace } })).toBe(0);
      expect(await command()).toMatchObject({ dryRun: false, created: 1, unchanged: 0 });
      expect(await command()).toMatchObject({ created: 0, unchanged: 1 });
      expect(await db.event.count({ where: { sourceNamespace: s.namespace } })).toBe(1);
    } finally { await rm(dir, { recursive: true, force: true }); }
  });

  it('serializes concurrent provider imports and rolls back an entire run on persistence failure', async () => {
    const s = source('concurrent'); const input = envelope(s, [record()]);
    const results = await Promise.all([importer.import(input), importer.import(input)]);
    expect(results.map((r) => r.created).sort()).toEqual([0, 1]); expect(results.map((r) => r.unchanged).sort()).toEqual([0, 1]);
    expect(await db.event.count({ where: { sourceNamespace: s.namespace } })).toBe(1);
    const fail = source('rollback'); const legacyId = `catalogue-legacy-${run}`; legacyIds.push(legacyId);
    await db.event.create({ data: { id: legacyId, slug: catalogueSlug(fail.namespace, 'collision'), name: 'Synthetic legacy collision', country: 'Unknown', latitude: 0, longitude: 0 } });
    await expect(importer.import(envelope(fail, [record('first'), record('collision')]))).rejects.toMatchObject({ code: 'P2002' });
    expect(await db.event.count({ where: { sourceNamespace: fail.namespace } })).toBe(0);
    expect(await db.catalogueImportRun.count({ where: { sourceNamespace: fail.namespace } })).toBe(0);
    expect(await db.event.findUnique({ where: { id: legacyId } })).not.toBeNull();
  });

  it('excludes DEMO and unprovenanced legacy imports at every beta catalogue/analytics access boundary', async () => {
    const demoId = 'demo-riverside-5k'; const demo = new PrismaDataStore(db, 'demo_v0', 'demo');
    expect(await demo.findEventId(demoId)).toBe(demoId); expect((await demo.listCourseFactors()).length).toBeGreaterThan(0);
    expect((await store.listActiveEvents()).every((e) => e.source === 'imported' && e.catalogue?.sourceNamespace)).toBe(true);
    expect(await store.findEventId(demoId)).toBeNull(); expect(await store.getEvent(demoId, '2026-10-03')).toBeNull();
    expect(await store.listOccurrences(demoId)).toEqual([]); expect(await store.listPlacementInputs(1200, [demoId], null, '2026-10-03')).toEqual([]);
    expect(await store.getAnalytics(demoId, 90)).toEqual({ competition: null, difficulty: null, courseSpeed: null, pb: null });
    expect((await store.listCourseFactors()).some((f) => f.eventId.startsWith('demo-'))).toBe(false);
    expect(await store.findEventId(legacyIds[0]!)).toBeNull();
    await expect(importer.import({ format: '5k-compass-catalogue-v1', source: { namespace: 'demo.test', kind: 'demo', attribution: 'Fictional' }, records: [record()] })).rejects.toBeInstanceOf(CatalogueInputError);
    const demoInputsBefore = await db.eventScore.count({ where: { event: { source: 'DEMO' } } });
    await recalculateAnalytics(db, '2026-10-03');
    expect(await db.eventScore.count({ where: { event: { source: 'DEMO' } } })).toBe(demoInputsBefore);
    expect((await queryCompetitionInputs(db, '2026-10-03')).some((r) => r.eventId.startsWith('demo-'))).toBe(false);
    expect((await queryPerformances(db, null, '2026-10-03')).some((r) => r.eventId.startsWith('demo-'))).toBe(false);
  });

  it('does not reuse a legacy demo-cohort Runner Form cache in beta', async () => {
    await db.runnerFormSnapshot.create({ data: { userId, distanceMeters: 5000, performanceRevision: 0, status: 'ESTIMATE', formSeconds: 1000, confidenceScore: 100, confidence: 'HIGH', trend: 'STABLE', sampleSize: 2, eventCount: 1, asOfDate: new Date('2026-10-03'), calculationVersion: RUNNER_FORM_VERSION, components: { status: 'estimate', formSeconds: 1000, cohort: 'legacy-demo-cohort' } } });
    const form = await currentRunnerForm(store, userId, '2026-10-03');
    expect(form.status).toBe('unavailable'); expect(form.formSeconds).toBeNull();
    expect(JSON.stringify(form)).not.toContain('legacy-demo-cohort');
    expect(await db.runnerFormSnapshot.findFirst({ where: { userId, asOfDate: new Date('2026-10-03') } })).toMatchObject({ evidenceScope: 'BETA_IMPORTED_V1', status: 'UNAVAILABLE' });
  });

  it('filters beta API catalogue queries and returns honest catalogue-only history and analytics', async () => {
    const s = source('api'); await importer.import(envelope(s, [record('scotland'), { ...record('wales'), name: 'Synthetic Cymru Saturday 5K', region: 'Wales', subdivisionCode: 'GB-WLS' }]));
    const event = await find(s.namespace, 'scotland');
    const db2 = createPrismaClient(url!); const betaStore = new PrismaDataStore(db2, 'demo_v0');
    const config = loadConfig({ APP_MODE: 'beta', NODE_ENV: 'test', DATABASE_URL: url, AUTH_BASE_URL: 'https://example.test', AUTH_SECRET: 'catalogue-test-secret-at-least-32-characters', EMAIL_TRANSPORT: 'test', LOG_LEVEL: 'silent' });
    const app = await buildApp({ config, store: betaStore, authRuntime: { db: db2, auth: createAuth(db2, config, { async send() {} }) }, logger: false });
    try {
      const events = await app.inject(`/api/events?countryCode=GB&region=Scotland&sourceNamespace=${s.namespace}`);
      expect(events.statusCode).toBe(200); expect(events.json().map((e: { id: string }) => e.id)).toEqual([event.id]);
      expect((await app.inject(`/api/events/search?q=Synthetic&sourceNamespace=${s.namespace}&region=Wales`)).json().map((e: { name: string }) => e.name)).toEqual(['Synthetic Cymru Saturday 5K']);
      for (const path of ['/api/events/demo-riverside-5k', '/api/events/demo-riverside-5k/history', '/api/events/demo-riverside-5k/analytics']) expect((await app.inject(path)).statusCode).toBe(404);
      const detail = (await app.inject(`/api/events/${event.id}`)).json();
      expect(detail).toMatchObject({ averageParticipants: null, scores: null, recentOccurrences: [], occurrencesLast90Days: 0, startTime: null });
      expect((await app.inject(`/api/events/${event.id}/analytics`)).json()).toMatchObject({ pb: null, competition: null, difficulty: null, courseSpeed: null });
      const history = (await app.inject(`/api/events/${event.id}/history`)).json();
      expect(history.eventId).toBe(event.id); expect(JSON.stringify(history)).not.toContain('demo-');
    } finally { await app.close(); }
  });
  it('rejects malformed URL rows structurally while committing valid siblings and coherent counts', async () => {
    const s = source('url-rejections');
    const invalid = ['not a URL', 'https://', ' ', 'javascript:alert(1)', 'https://user:password@', 'http://[invalid', 'https://user:password@example.test'];
    const rows = [
      { ...record('https-valid'), sourceUrl: 'https://example.test/valid' },
      { ...record('http-valid'), officialUrl: 'http://example.test/valid' },
      record('optional-missing'),
      ...invalid.map((sourceUrl, index) => ({ ...record(`bad-${index}`), sourceUrl })),
    ];
    expect(await importer.import(envelope(s, rows), { dryRun: true })).toMatchObject({ runId: null, created: 3, rejected: 7 });
    expect(await db.event.count({ where: { sourceNamespace: s.namespace } })).toBe(0);
    expect(await db.catalogueImportRun.count({ where: { sourceNamespace: s.namespace } })).toBe(0);
    const result = await importer.import(envelope(s, rows));
    expect(result).toMatchObject({ received: 10, created: 3, rejected: 7, updated: 0, unchanged: 0, deactivated: 0 });
    expect(result.rejections.map((rejection) => rejection.index)).toEqual([3, 4, 5, 6, 7, 8, 9]);
    expect(result.rejections.every((rejection) => rejection.issues.some((issue) => issue.path === 'sourceUrl'))).toBe(true);
    expect((await db.event.findMany({ where: { sourceNamespace: s.namespace }, orderBy: { externalId: 'asc' }, select: { externalId: true } })).map((event) => event.externalId)).toEqual(['http-valid', 'https-valid', 'optional-missing']);
    expect(await db.catalogueImportRun.findUniqueOrThrow({ where: { id: result.runId! } })).toMatchObject({ received: 10, created: 3, rejected: 7 });
    await expect(importer.import(envelope({ ...s, referenceUrl: 'https://' }, [record('invalid-envelope')]))).rejects.toBeInstanceOf(CatalogueInputError);
    expect(await db.event.count({ where: { sourceNamespace: s.namespace } })).toBe(3);
  });

  it('scopes beta visits end-to-end while preserving DEMO, legacy, active, inactive and external canonical facts', async () => {
    const s = source('historical-visits');
    await importer.import(envelope(s, [
      { ...record('active'), name: 'Aster Active', latitude: 53.4, longitude: -2.6 },
      { ...record('inactive'), name: 'Birch Inactive', latitude: 53.4, longitude: -2.6, active: true },
      { ...record('c-opportunity'), name: 'Cedar Trusted Opportunity', latitude: 53.4, longitude: -2.6 },
      { ...record('d-opportunity'), name: 'Daisy Trusted Opportunity', latitude: 53.4, longitude: -2.6 },
    ]));
    const active = await find(s.namespace, 'active'); const inactive = await find(s.namespace, 'inactive');
    const c = await find(s.namespace, 'c-opportunity'); const d = await find(s.namespace, 'd-opportunity');
    const demoId = `visits-demo-${run}`; const legacyId = `visits-legacy-${run}`; legacyIds.push(demoId, legacyId);
    await db.event.createMany({ data: [
      { id: demoId, slug: demoId, name: 'Cedar Demo', country: 'Test', latitude: 53.4, longitude: -2.6, source: 'DEMO' },
      { id: legacyId, slug: legacyId, name: 'Daisy Legacy', country: 'Test', latitude: 53.4, longitude: -2.6, source: 'IMPORTED' },
    ] });
    const config = loadConfig({ APP_MODE: 'beta', NODE_ENV: 'test', DATABASE_URL: url, AUTH_BASE_URL: 'https://example.test', AUTH_SECRET: 'historical-visits-test-secret-at-least-32-characters', EMAIL_TRANSPORT: 'test', LOG_LEVEL: 'silent' });
    let otp = '';
    const app = await buildApp({ config, store, now: () => new Date('2026-10-03T10:00:00Z'), authRuntime: { db, auth: createAuth(db, config, { async send(_email, code) { otp = code; } }) }, logger: false });
    const email = `catalogue-visits-${run}@example.test`;
    const request = (method: 'GET' | 'POST', path: string, cookie?: string, payload?: object) => app.inject({ method, url: path, remoteAddress: '10.81.0.4', headers: { origin: 'https://example.test', ...(cookie ? { cookie } : {}) }, payload });
    try {
      expect((await request('POST', '/api/auth/email-otp/send-verification-otp', undefined, { email })).statusCode).toBe(200);
      const login = await request('POST', '/api/auth/sign-in/email-otp', undefined, { email, otp });
      expect(login.statusCode).toBe(200);
      const token = login.cookies.find((cookie) => cookie.name.endsWith('.session_token'))!; const cookie = `${token.name}=${token.value}`;
      const owner = await db.user.findUniqueOrThrow({ where: { email } });
      await db.user.update({ where: { id: owner.id }, data: { homeLat: 53.4, homeLon: -2.6, defaultTravelMinutes: 90 } });
      for (const [eventId, date] of [[demoId, '2026-10-02'], [demoId, '2026-09-01'], [legacyId, '2026-09-12'], [active.id, '2026-09-26'], [inactive.id, '2026-09-19'], [null, '2026-09-05']] as const) {
        await db.userPerformance.create({ data: { userId: owner.id, eventId, externalEventName: eventId == null ? 'External Race' : null, performanceType: eventId == null ? 'ROAD_RACE' : 'PARKRUN', date: new Date(date), finishTimeSeconds: 1300, duplicateKey: `${eventId ?? 'external'}|${date}|5000` } });
      }
      // Deactivation after the recorded achievement must not erase historical credit.
      expect(await importer.import(envelope(s, [{ ...record('inactive'), name: 'Birch Inactive', latitude: 53.4, longitude: -2.6, active: false }]))).toMatchObject({ deactivated: 1 });
      const canonicalBefore = await store.listUserPerformances(owner.id);
      expect(canonicalBefore).toHaveLength(6);
      expect(new Set(await store.listTrustedEventIds([demoId, legacyId, active.id, inactive.id]))).toEqual(new Set([active.id, inactive.id]));
      const state = await loadExploreState(store, owner.id, '2026-10-03');
      expect(state.history.events.map((event) => event.eventId).sort()).toEqual([active.id, inactive.id].sort());
      expect(state.history).toMatchObject({ totalRuns: 6, externalRuns: 1 });
      const alphabet = state.challenges.find((challenge) => challenge.id === 'alphabet')!;
      expect(alphabet.completedItems).toEqual(['A', 'B']); expect(alphabet.progress).toMatchObject({ current: 2, target: 25 });
      const context = (await loadUser(store, owner.id, '2026-10-03'))!;
      expect(context.events.filter((event) => event.visited).map((event) => event.eventId).sort()).toEqual([active.id, inactive.id].sort());
      expect(context.performance).toMatchObject({ totalPerformances: 6, uniqueEvents: 5 });
      const profile = (await request('GET', '/api/profile', cookie)).json();
      expect(profile).toMatchObject({ runsCompleted: 6, uniqueEventsVisited: 2, performance: { totalPerformances: 6, uniqueEvents: 5 } });
      const history = (await request('GET', '/api/profile/performances', cookie)).json();
      expect(history.total).toBe(6); expect(history.performances.some((performance: { eventId: string }) => performance.eventId === demoId)).toBe(true);
      expect(history.performances.some((performance: { eventId: string }) => performance.eventId === legacyId)).toBe(true);
      const exploring = (await request('GET', '/api/profile/explore-summary', cookie)).json();
      expect(exploring).toMatchObject({ eventsVisited: 2, totalRuns: 6, mostVisited: { eventId: active.id }, latestVisit: { eventId: active.id } });
      expect((await request('GET', `/api/profile/events/${inactive.id}/visits`, cookie)).json()).toMatchObject({ visited: true, visitCount: 1 });
      for (const [letter, candidate] of [['C', c.id], ['D', d.id]]) {
        const opportunities = (await request('GET', `/api/profile/challenges/alphabet/opportunities?item=${letter}`, cookie)).json();
        expect(opportunities.completed).toBe(false); expect(opportunities.events.map((event: { id: string }) => event.id)).toEqual([candidate]);
        const saturday = (await request('GET', `/api/saturday/recommendations?intent=challenge&challenge=alphabet&item=${letter}`, cookie)).json();
        expect(saturday.bestPick.event.id).toBe(candidate); expect(saturday.challenge.missingItems.some((item: { key: string }) => item.key === letter)).toBe(true);
      }
      const done = (await request('GET', '/api/saturday/recommendations?intent=challenge&challenge=alphabet&item=B', cookie)).json();
      expect(done.results).toEqual([]); expect(done.message).toContain('already completed B');
      const available = (await request('GET', '/api/events', cookie)).json();
      expect(available.find((event: { id: string }) => event.id === active.id).visited).toBe(true);
      expect(available.find((event: { id: string }) => event.id === c.id).visited).toBe(false);
      expect(available.some((event: { id: string }) => [demoId, legacyId, inactive.id].includes(event.id))).toBe(false);
      for (const path of ['/api/saturday/recommendations?intent=new_event', '/api/hidden-gems?mode=not_visited']) {
        const response = (await request('GET', path, cookie)).json(); const ids = response.results.map((result: { event: { id: string } }) => result.event.id);
        expect(ids).toContain(c.id); expect(ids).not.toContain(active.id); expect(ids).not.toContain(inactive.id);
      }
      const exported = (await request('GET', '/api/account/export', cookie)).json(); expect(exported.performances).toHaveLength(6);
      expect(await store.listUserPerformances(owner.id)).toEqual(canonicalBefore);
      const demoStore = new PrismaDataStore(db, 'demo_v0', 'demo');
      expect(await demoStore.listTrustedEventIds([demoId, legacyId, active.id, inactive.id])).toEqual([demoId]);
      expect((await loadExploreState(demoStore, owner.id, '2026-10-03')).challenges.find((challenge) => challenge.id === 'alphabet')!.completedItems).toEqual(['C']);
    } finally { await app.close(); }
  });

});
