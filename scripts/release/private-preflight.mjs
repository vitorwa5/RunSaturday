import { readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { parseArgs } from 'node:util';
import { databaseTarget, externalPath, privateIPv4, readEnv } from './private-policy.mjs';

export function preflight(envPath, checkout, recordPath) {
  externalPath(envPath, checkout, 0o600);
  const env = readEnv(envPath);
  if (!privateIPv4(env.STAGE_BIND_IP ?? '127.0.0.1')) throw new Error('Bind must be loopback, RFC1918 or Tailscale IPv4');
  if (!(env.STAGE_BIND_IP ?? '127.0.0.1').startsWith('127.') && env.STAGE_APPROVED_VPN_IP !== env.STAGE_BIND_IP) throw new Error('Non-loopback bind requires owner-approved VPN interface confirmation');
  if (!/^[a-f0-9]{40}$/.test(env.REVIEWED_COMMIT ?? '')) throw new Error('Reviewed commit required');
  externalPath(recordPath, checkout, 0o600);
  const record = JSON.parse(readFileSync(recordPath, 'utf8'));
  if (record.commit !== env.REVIEWED_COMMIT || record.privateBanner !== true) throw new Error('Image review record mismatch');
  for (const key of ['API_IMAGE', 'WEB_IMAGE', 'MIGRATION_IMAGE']) {
    if (!/^(?:sha256:[a-f0-9]{64}|[^\s]+@sha256:[a-f0-9]{64})$/.test(env[key] ?? '') || record[key] !== env[key]) throw new Error('Reviewed immutable images required');
  }
  for (const key of ['API_ENV_FILE', 'ACCESS_ENV_FILE']) externalPath(env[key], checkout, 0o600);
  const api = readEnv(env.API_ENV_FILE);
  databaseTarget(api);
  if (!api.AUTH_SECRET || api.AUTH_SECRET.length < 32 || /REPLACE/.test(api.AUTH_SECRET) || api.EMAIL_API_KEY || api.EMAIL_FROM) throw new Error('Unique auth secret and no provider credentials required');
  const allowedApi = new Set(['DATABASE_URL', 'PRIVATE_STAGE_DATABASE', 'PRIVATE_STAGE_SYNTHETIC_ONLY', 'AUTH_SECRET']);
  if (Object.keys(api).some((key) => !allowedApi.has(key))) throw new Error('Unexpected private API binding');
  const access = readEnv(env.ACCESS_ENV_FILE);
  if (!/^[a-zA-Z0-9_-]+$/.test(access.STAGE_ACCESS_USER ?? '') || !/^\$2[aby]\$\d\d\$[./a-zA-Z0-9]{53}$/.test(access.STAGE_ACCESS_HASH ?? '')) throw new Error('Hashed private access credentials required');
  externalPath(env.OTP_OPERATOR_DIR, checkout, 0o700, true);
  externalPath(join(env.OTP_OPERATOR_DIR, 'otp.jsonl'), checkout, 0o600);
  externalPath(env.TLS_DIR, checkout, 0o700, true);
  externalPath(join(env.TLS_DIR, 'tls.key'), checkout, 0o600);
  externalPath(join(env.TLS_DIR, 'tls.crt'), checkout, 0o600);
  return { status: 'configuration-ready', commit: env.REVIEWED_COMMIT, bind: `${env.STAGE_BIND_IP ?? '127.0.0.1'}:8443`, note: 'No services started; runtime isolation and certificate checks still required.' };
}
if (process.argv[1] === new URL(import.meta.url).pathname) {
  try {
    const { values } = parseArgs({ options: { env: { type: 'string' }, record: { type: 'string' }, checkout: { type: 'string', default: process.cwd() } } });
    console.log(JSON.stringify(preflight(values.env, resolve(values.checkout), values.record)));
  } catch { console.error('Private preflight refused: check external permissions, private bind, synthetic database, credentials and image review record.'); process.exitCode = 1; }
}
