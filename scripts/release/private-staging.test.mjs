import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { databaseTarget, externalPath, inspectSyntheticDatabase, privateIPv4, syntheticAuthBody, syntheticEmail } from './private-policy.mjs';
import { syntheticCatalogue, validateSyntheticCatalogue } from './private-catalogue.mjs';
import { preflight } from './private-preflight.mjs';

test('network and database guards reject public, wildcard, alternate target and query overrides', () => {
  for (const ip of ['127.0.0.1', '10.2.3.4', '172.16.0.2', '192.168.0.2', '100.64.0.2']) assert.equal(privateIPv4(ip), true);
  for (const ip of ['0.0.0.0', '8.8.8.8', '169.254.1.1', '100.128.0.1', 'localhost', '::']) assert.equal(privateIPv4(ip), false);
  const env = { PRIVATE_STAGE_SYNTHETIC_ONLY: 'true', PRIVATE_STAGE_DATABASE: 'compass_private_synthetic', DATABASE_URL: 'postgresql://stage:fake@10.0.0.2/compass_private_synthetic' };
  assert.doesNotThrow(() => databaseTarget(env));
  for (const patch of [{ PRIVATE_STAGE_SYNTHETIC_ONLY: 'false' }, { PRIVATE_STAGE_DATABASE: 'production' }, { DATABASE_URL: env.DATABASE_URL + '?host=8.8.8.8' }, { DATABASE_URL: env.DATABASE_URL.replace('10.0.0.2', '8.8.8.8') }, { DATABASE_URL: env.DATABASE_URL.replace('/compass_private_synthetic', '/production') }]) assert.throws(() => databaseTarget({ ...env, ...patch }));
  for (const key of ['PGOPTIONS', 'PGSERVICE', 'PGHOST', 'PGDATABASE', 'PGUSER', 'PGPASSWORD', 'PGSSLMODE']) assert.throws(() => databaseTarget({ ...env, [key]: 'override' }), /libpq/);
  assert.equal(syntheticEmail('synthetic@example.test'), true);
  for (const email of ['owner@gmail.com', 'other@example.test', 'synthetic@example.test.evil', 'x@synthetic@example.test']) assert.equal(syntheticEmail(email), false);
});

test('read-only database provenance check refuses non-fixture or historical rows', async () => {
  const queries = [];
  const client = { async query(sql) { queries.push(sql); return { rows: sql.includes('pg_catalog.pg_tables') ? [] : sql.includes('to_regclass') ? [{ name: 'exists' }] : [{ unsafe: sql.includes('EventScore') }] }; } };
  await assert.rejects(inspectSyntheticDatabase(client), /non-fixture/);
  assert.ok(queries.every((q) => q.startsWith('SELECT')));
  await assert.doesNotReject(inspectSyntheticDatabase({ async query(sql) { return { rows: sql.includes('pg_catalog.pg_tables') ? [] : sql.includes('to_regclass') ? [{ name: 'exists' }] : [{ unsafe: false }] }; } }));
  await assert.rejects(inspectSyntheticDatabase({ async query() { return { rows: [{ schemaname: 'public', tablename: 'Customer' }] }; } }), /unknown/);
});

test('synthetic email gate rejects alternate auth spellings and leaves sign-out available', () => {
  for (const path of ['/api/auth/email-otp/send-verification-otp', '/api/auth/sign-in/email-otp', '/api/auth/%65mail-otp/send-verification-otp', '/api/auth/future-route']) {
    assert.equal(syntheticAuthBody('POST', path, Buffer.from('{"email":"other@example.test"}')), false);
    assert.equal(syntheticAuthBody('POST', path, Buffer.from('{"email":"synthetic@example.test"}')), true);
    assert.throws(() => syntheticAuthBody('POST', path, Buffer.from('invalid')));
  }
  assert.equal(syntheticAuthBody('POST', '/api/auth/sign-out', Buffer.from('')), true);
  assert.equal(syntheticAuthBody('POST', '/api/history', Buffer.from('{}')), true);
});

test('synthetic catalogue has no scores/results and rejects foreign attribution', () => {
  assert.equal(validateSyntheticCatalogue(syntheticCatalogue()).records.length, 2);
  const value = syntheticCatalogue(); value.source.namespace = 'real-provider';
  assert.throws(() => validateSyntheticCatalogue(value));
  const scores = syntheticCatalogue(); scores.records[0].pbScore = 80;
  assert.throws(() => validateSyntheticCatalogue(scores));
});

test('preflight enforces external permissions, image record and approved VPN interface without starting anything', () => {
  const dir = mkdtempSync(join(tmpdir(), 'compass-stage-'));
  const checkout = join(dir, 'checkout'); mkdirSync(checkout);
  const file = (name, value) => { const path = join(dir, name); writeFileSync(path, value, { mode: 0o600 }); return path; };
  try {
    const inbox = join(dir, 'operator'); mkdirSync(inbox, { mode: 0o700 }); file('operator/otp.jsonl', '');
    const tls = join(dir, 'tls'); mkdirSync(tls, { mode: 0o700 }); file('tls/tls.key', 'fixture'); file('tls/tls.crt', 'fixture');
    const api = file('api.env', 'DATABASE_URL=postgresql://fake:fake@10.0.0.2/compass_private_synthetic\nPRIVATE_STAGE_DATABASE=compass_private_synthetic\nPRIVATE_STAGE_SYNTHETIC_ONLY=true\nAUTH_SECRET=fixture-only-not-a-real-secret-32-characters\n');
    const access = file('access.env', `STAGE_ACCESS_USER=owner\nSTAGE_ACCESS_HASH='$2a$14$${'a'.repeat(53)}'\n`);
    const image = `sha256:${'a'.repeat(64)}`;
    const record = file('record.json', JSON.stringify({ commit: 'b'.repeat(40), privateBanner: true, API_IMAGE: image, WEB_IMAGE: image, MIGRATION_IMAGE: image }));
    const bindings = `REVIEWED_COMMIT=${'b'.repeat(40)}\nAPI_IMAGE=${image}\nWEB_IMAGE=${image}\nMIGRATION_IMAGE=${image}\nAPI_ENV_FILE=${api}\nACCESS_ENV_FILE=${access}\nOTP_OPERATOR_DIR=${inbox}\nTLS_DIR=${tls}\n`;
    const env = file('compose.env', bindings);
    assert.equal(preflight(env, checkout, record).status, 'configuration-ready');
    writeFileSync(env, bindings + 'STAGE_BIND_IP=10.0.0.8\n');
    assert.throws(() => preflight(env, checkout, record), /VPN/);
    writeFileSync(env, bindings + 'STAGE_BIND_IP=10.0.0.8\nSTAGE_APPROVED_VPN_IP=10.0.0.8\n');
    assert.equal(preflight(env, checkout, record).bind, '10.0.0.8:8443');
    chmodSync(api, 0o644); assert.throws(() => preflight(env, checkout, record));
    const inside = join(checkout, 'bad.env'); writeFileSync(inside, 'fixture', { mode: 0o600 });
    assert.throws(() => externalPath(inside, checkout, 0o600));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
