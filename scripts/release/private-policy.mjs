import { isIP } from 'node:net';
import { lstatSync, realpathSync, readFileSync } from 'node:fs';
import { resolve, sep } from 'node:path';

export function privateIPv4(value) {
  if (isIP(value) !== 4) return false;
  const [a, b] = value.split('.').map(Number);
  return a === 127 || a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
}
export function syntheticEmail(value) {
  return typeof value === 'string' && value.trim().toLowerCase() === 'synthetic@example.test';
}
export function syntheticAuthBody(method, url, body) {
  if (method !== 'POST') return true;
  const path = decodeURIComponent(new URL(url, 'http://stage').pathname);
  if (!path.startsWith('/api/auth/') || path === '/api/auth/sign-out') return true;
  const input = JSON.parse(body.toString());
  return syntheticEmail(input?.email);
}
export function databaseTarget(env) {
  // pg and the importer must resolve the same explicit URL, never ambient libpq
  // service, credentials, connection or search_path overrides.
  if (Object.keys(env).some((key) => /^PG[A-Z0-9_]*$/.test(key))) throw new Error('Ambient libpq overrides are forbidden for private staging');
  if (env.PRIVATE_STAGE_SYNTHETIC_ONLY !== 'true' || !/^compass_private_synthetic(?:_[a-z0-9]+)?$/.test(env.PRIVATE_STAGE_DATABASE ?? '')) throw new Error('Explicit synthetic stage database required');
  let url;
  try { url = new URL(env.DATABASE_URL); } catch { throw new Error('Stage database configuration required'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !privateIPv4(url.hostname) || decodeURIComponent(url.pathname.slice(1)) !== env.PRIVATE_STAGE_DATABASE || [...url.searchParams.keys()].some((key) => key !== 'sslmode')) throw new Error('Refusing non-private or unexpected stage database target');
  return url;
}
export function externalPath(path, checkout, mode, directory = false) {
  if (!path || !path.startsWith('/')) throw new Error('Absolute external path required');
  const real = realpathSync(path);
  const root = realpathSync(checkout);
  if (real === root || real.startsWith(root + sep) || lstatSync(path).isSymbolicLink()) throw new Error('Private files must be outside checkout and not symlinks');
  const st = lstatSync(real);
  if ((st.mode & 0o777) !== mode || (directory ? !st.isDirectory() : !st.isFile())) throw new Error('Private file permissions/type rejected');
  return real;
}
export function readEnv(path) {
  const out = {};
  for (const raw of readFileSync(path, 'utf8').split(/\r?\n/)) {
    if (!raw.trim() || raw.trimStart().startsWith('#')) continue;
    const match = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(raw);
    if (!match || Object.hasOwn(out, match[1])) throw new Error('Use plain unique KEY=value bindings');
    let value = match[2];
    if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
    if (/[\r\n]/.test(value) || value.includes('${')) throw new Error('Env interpolation is forbidden');
    out[match[1]] = value;
  }
  return out;
}
export async function inspectSyntheticDatabase(client) {
  // Read-only checks. No seed, reset, delete, schema creation, or migration here.
  const known = new Set(['_prisma_migrations', 'User', 'Event', 'CatalogueImportRun', 'EventOccurrence', 'Result', 'EventScore', 'CourseFactorSnapshot', 'RunnerFormSnapshot', 'UserPerformance', 'UserEvent', 'Account', 'Session', 'Verification', 'RateLimit', 'EmailAuthBudget']);
  const tables = await client.query("SELECT schemaname, tablename FROM pg_catalog.pg_tables WHERE schemaname NOT IN ('pg_catalog','information_schema')");
  if (tables.rows.some((row) => row.schemaname !== 'public' || !known.has(row.tablename))) throw new Error('Refusing unknown stage database schema');
  for (const [table, predicate] of [
    ['User', `email IS NULL OR lower(email) != 'synthetic@example.test' OR "isDemo" = true`],
    ['Event', `"sourceNamespace" IS DISTINCT FROM 'synthetic.private' OR name NOT LIKE 'Synthetic %' OR source != 'IMPORTED'`],
    ['CatalogueImportRun', `"sourceNamespace" != 'synthetic.private' OR "sourceAttribution" NOT LIKE 'Synthetic %'`],
    ['EmailAuthBudget', `lower(email) != 'synthetic@example.test'`],
    ['EventOccurrence', 'true'], ['Result', 'true'], ['EventScore', 'true'], ['CourseFactorSnapshot', 'true'],
  ]) {
    const exists = await client.query('SELECT to_regclass($1) AS name', [`public."${table}"`]);
    if (!exists.rows[0].name) continue;
    const result = await client.query(`SELECT EXISTS (SELECT 1 FROM public."${table}" WHERE ${predicate}) AS unsafe`);
    if (result.rows[0].unsafe) throw new Error('Refusing non-fixture data in stage database');
  }
}
