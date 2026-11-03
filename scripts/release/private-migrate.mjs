import { spawnSync } from 'node:child_process';
import { checkDatabase } from './private-database.mjs';
try {
  await checkDatabase();
  const run = spawnSync('/app/node_modules/.bin/prisma', ['migrate', 'deploy'], { cwd: '/app/apps/api', stdio: 'inherit' });
  process.exitCode = run.status ?? 1;
} catch { console.error('Private migration refused: isolated synthetic target required.'); process.exitCode = 1; }
