import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import { isDeepStrictEqual } from 'node:util';
import { databaseTarget } from './private-policy.mjs';
import { syntheticCatalogue, validateSyntheticCatalogue } from './private-catalogue.mjs';

/** Fixed catalogue only: no caller file, arbitrary source, history or personal data. */
export function exactSyntheticCatalogue(input) {
  validateSyntheticCatalogue(input);
  if (!isDeepStrictEqual(input, syntheticCatalogue())) throw new Error('Only the exact reviewed synthetic catalogue is permitted');
  return input;
}

export async function privateImport(options = {}, dependencies = {}) {
  const env = dependencies.env ?? process.env;
  const input = exactSyntheticCatalogue(syntheticCatalogue());
  if (!options.apply) return { status: 'dry-run', namespace: input.source.namespace, records: input.records.length, databaseContacted: false };
  // No side effect, temp file or child process before all refusal checks pass.
  databaseTarget(env);
  if (options.confirmDatabase !== env.PRIVATE_STAGE_DATABASE) throw new Error('Exact synthetic database confirmation required');
  const check = dependencies.checkDatabase ?? (await import('./private-database.mjs')).checkDatabase;
  await check();
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const makeTemp = dependencies.mkdtempSync ?? mkdtempSync;
  const write = dependencies.writeFileSync ?? writeFileSync;
  const remove = dependencies.rmSync ?? rmSync;
  const run = dependencies.spawnSync ?? spawnSync;
  const dir = makeTemp(join(tmpdir(), 'compass-private-catalogue-'));
  try {
    const path = join(dir, 'catalogue.json');
    write(path, JSON.stringify(input), { mode: 0o600, flag: 'wx' });
    const result = run(process.execPath, [join(root, 'node_modules/tsx/dist/cli.mjs'), join(root, 'apps/api/scripts/import-catalogue.ts'), '--file', path], {
      cwd: join(root, 'apps/api'),
      env: { ...env, APP_MODE: 'beta', NODE_ENV: 'test' },
      stdio: 'inherit', shell: false,
    });
    if (result.status !== 0 || result.error) throw new Error('Guarded synthetic import did not complete');
    return { status: 'import-completed', namespace: input.source.namespace, records: input.records.length };
  } finally { remove(dir, { recursive: true, force: true }); }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const { values } = parseArgs({ strict: true, allowPositionals: false, options: {
      apply: { type: 'boolean', default: false }, 'dry-run': { type: 'boolean', default: false }, 'confirm-database': { type: 'string' },
    } });
    if (values.apply && values['dry-run']) throw new Error('Choose one mode');
    console.log(JSON.stringify(await privateImport({ apply: values.apply, confirmDatabase: values['confirm-database'] })));
  } catch { console.error('Synthetic import refused: exact reviewed fixture, isolated stage target and explicit confirmation are required.'); process.exitCode = 1; }
}
