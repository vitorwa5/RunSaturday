import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

// Fake libpq programs: these checks never connect to a database.
test('backup/restore fail closed and preserve the archive on failure', () => {
  const dir = mkdtempSync(join(tmpdir(), 'compass-operations-'));
  try {
    const bin = join(dir, 'bin'); mkdirSync(bin);
    const tool = (name, body) => writeFileSync(join(bin, name), `#!/bin/sh\nset -eu\n${body}\n`, { mode: 0o700 });
    tool('pg_dump', 'for arg; do case "$arg" in --file=*) file=${arg#--file=};; esac; done\nprintf synthetic > "$file"');
    tool('pg_restore', 'test "${MOCK_RESTORE_FAIL:-0}" = 0');
    tool('psql', 'printf "%s\\n" "${MOCK_TABLES:-0}"');
    const env = { ...process.env, PATH: `${bin}:${process.env.PATH}`, PGDATABASE: 'recovery_fixture', PGHOST: 'invalid.example', RESTORE_CONFIRM: 'recovery_fixture' };
    const run = (script, path, extra = {}) => spawnSync('sh', [resolve(`scripts/release/${script}.sh`), path], { env: { ...env, ...extra }, encoding: 'utf8' });
    const archive = join(dir, 'fixture.dump');
    assert.equal(run('backup', archive).status, 0);
    assert.equal(readFileSync(archive, 'utf8'), 'synthetic');
    assert.notEqual(run('backup', archive).status, 0);
    const failure = join(dir, 'failed.dump');
    assert.notEqual(run('backup', failure, { MOCK_RESTORE_FAIL: '1' }).status, 0);
    assert.equal(existsSync(failure), false);
    assert.equal(run('restore', archive).status, 0);
    assert.notEqual(run('restore', archive, { MOCK_TABLES: '1' }).status, 0);
    assert.notEqual(run('restore', archive, { RESTORE_CONFIRM: 'other' }).status, 0);
    assert.notEqual(run('restore', archive, { PGDATABASE: 'postgresql://secret@host/db' }).status, 0);
    assert.notEqual(run('backup', archive, { PGHOST: '', PGSERVICE: '' }).status, 0);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('container readiness requires a real healthy database', () => {
  const healthcheck = resolve('scripts/release/healthcheck.mjs');
  const run = (body, ok = true) => spawnSync(process.execPath, ['--input-type=module', '-e', `globalThis.fetch = async () => ({ ok: ${ok}, json: async () => (${JSON.stringify(body)}) }); await import(${JSON.stringify(healthcheck)});`]);
  assert.equal(run({ status: 'ok', dataSource: 'database', database: 'ok' }).status, 0);
  assert.equal(run({ status: 'ok', dataSource: 'demo', database: 'not_used' }).status, 1);
  assert.equal(run({ status: 'degraded', dataSource: 'database', database: 'unavailable' }, false).status, 1);
  const failure = spawnSync(process.execPath, ['--input-type=module', '-e', `globalThis.fetch = async () => { throw new Error('network'); }; await import(${JSON.stringify(healthcheck)});`]);
  assert.equal(failure.status, 1);
});
