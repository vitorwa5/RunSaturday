import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CatalogueImportService, catalogueSlug } from '../catalogue/importService';
import { CatalogueInputError } from '../catalogue/schema';
import { createPrismaClient } from '../db/prisma';
import { PrismaDataStore, queryCompetitionInputs, queryPerformances } from '../repositories/prisma/PrismaDataStore';
import { recalculateAnalytics } from '../analytics/recalculate';
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
    await db.user.deleteMany({ where: { id: userId } });
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
});
