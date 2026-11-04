import { test } from 'node:test';
import assert from 'node:assert/strict';
import { exactSyntheticCatalogue, privateImport } from './private-import.mjs';
import { syntheticCatalogue } from './private-catalogue.mjs';

const env = { PRIVATE_STAGE_SYNTHETIC_ONLY: 'true', PRIVATE_STAGE_DATABASE: 'compass_private_synthetic', DATABASE_URL: 'postgresql://fake:fake@10.0.0.2/compass_private_synthetic' };
const options = { apply: true, confirmDatabase: env.PRIVATE_STAGE_DATABASE };
function stubs() {
  const calls = []; const payloads = [];
  return { calls, payloads, dependencies: {
    env,
    async checkDatabase() { calls.push('guard'); },
    mkdtempSync() { calls.push('temp'); return '/fake-private-tmp'; },
    writeFileSync(path, body, settings) { calls.push('write'); payloads.push(JSON.parse(body)); assert.equal(settings.mode, 0o600); assert.equal(settings.flag, 'wx'); },
    spawnSync(command, args, settings) {
      calls.push('child');
      assert.equal(command, process.execPath); assert.ok(args[0].endsWith('/node_modules/tsx/dist/cli.mjs'));
      assert.ok(args[1].endsWith('/apps/api/scripts/import-catalogue.ts'));
      assert.deepEqual(args.slice(2), ['--file', '/fake-private-tmp/catalogue.json']);
      assert.equal(settings.shell, false); assert.equal(settings.env.APP_MODE, 'beta');
      return { status: 0 };
    },
    rmSync(path, settings) { calls.push('cleanup'); assert.equal(path, '/fake-private-tmp'); assert.equal(settings.recursive, true); },
  } };
}

test('default and explicit dry run contact no database or child process', async () => {
  const { calls, dependencies } = stubs();
  assert.equal((await privateImport({}, dependencies)).databaseContacted, false);
  assert.deepEqual(calls, []);
});

test('target, confirmation and live provenance refusal prevent every write and child process', async () => {
  for (const override of [{ env: { ...env, PRIVATE_STAGE_SYNTHETIC_ONLY: 'false' } }, { env: { ...env, DATABASE_URL: env.DATABASE_URL.replace('10.0.0.2', '8.8.8.8') } }, { env: { ...env, PRIVATE_STAGE_DATABASE: 'production' } }, { env: { ...env, PGOPTIONS: '-c search_path=other' } }, { env: { ...env, PGSERVICE: 'other' } }, { async checkDatabase() { throw new Error('nonfixture'); } }]) {
    const { calls, dependencies } = stubs();
    await assert.rejects(privateImport(options, { ...dependencies, ...override }));
    assert.deepEqual(calls, []);
  }
  const { calls, dependencies } = stubs();
  await assert.rejects(privateImport({ ...options, confirmDatabase: 'other' }, dependencies));
  assert.deepEqual(calls, []);
});

test('fixed payload repeats stable external identities through existing nondestructive importer', async () => {
  const { calls, payloads, dependencies } = stubs();
  await privateImport(options, dependencies); await privateImport(options, dependencies);
  assert.deepEqual(calls, ['guard', 'temp', 'write', 'child', 'cleanup', 'guard', 'temp', 'write', 'child', 'cleanup']);
  assert.deepEqual(payloads[0], payloads[1]);
  assert.deepEqual(payloads[0], syntheticCatalogue());
});

test('unexpected source, field, coordinate, identity or historical value is rejected', () => {
  for (const mutate of [
    (v) => { v.source.namespace = 'real.source'; },
    (v) => { v.source.referenceUrl = 'https://real.example/'; },
    (v) => { v.records[0].latitude = 42; },
    (v) => { v.records[0].externalId = 'synthetic-other'; },
    (v) => { v.records[0].scores = [99]; },
    (v) => { v.records[0].name = 'Synthetic Real Person'; },
  ]) {
    const value = syntheticCatalogue(); mutate(value); assert.throws(() => exactSyntheticCatalogue(value));
  }
});

test('child failure reports failure and removes temporary fixture', async () => {
  const { calls, dependencies } = stubs();
  await assert.rejects(privateImport(options, { ...dependencies, spawnSync() { calls.push('child-failed'); return { status: 2 }; } }));
  assert.deepEqual(calls, ['guard', 'temp', 'write', 'child-failed', 'cleanup']);
});
