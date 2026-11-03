import { readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { parseArgs } from 'node:util';
import { externalPath, syntheticEmail } from './private-policy.mjs';
try {
  const { values } = parseArgs({ options: { inbox: { type: 'string' }, email: { type: 'string' } } });
  if (!syntheticEmail(values.email)) throw new Error('Synthetic identity required');
  externalPath(dirname(values.inbox), process.cwd(), 0o700, true);
  externalPath(values.inbox, process.cwd(), 0o600);
  const rows = readFileSync(values.inbox, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
  const row = rows.findLast((row) => row.email.toLowerCase() === values.email.trim().toLowerCase());
  if (!row || !/^\d{6}$/.test(row.code)) throw new Error('No code');
  process.stdout.write(`${row.code}\n`);
} catch { console.error('OTP unavailable: verify your synthetic address and secure operator inbox.'); process.exitCode = 1; }
