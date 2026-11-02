/** Test-only DEMO host: keep the dataset and request clock coherent for exact E2E assertions. */
import { buildApp } from '../src/app';
import { loadConfig } from '../src/config/env';
import { MemoryDataStore } from '../src/repositories/memory/MemoryDataStore';

if (process.env.NODE_ENV !== 'test') throw new Error('E2E DEMO server requires NODE_ENV=test');

// Same Thursday fixture as src/__tests__/helpers.ts: Current Form is exactly 1202 seconds.
const fixedNow = new Date('2026-10-01T09:00:00Z');
const config = loadConfig({
  NODE_ENV: 'test', APP_MODE: 'demo', DATA_SOURCE: 'demo', HOST: '127.0.0.1',
  PORT: process.env.PORT ?? '3101', LOG_LEVEL: 'warn', APP_TIME_ZONE: 'Europe/London',
  CORS_ORIGINS: 'http://127.0.0.1:5174',
});
const app = await buildApp({
  config,
  store: new MemoryDataStore('2026-10-01'),
  now: () => new Date(fixedNow),
});
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => { void app.close().then(() => process.exit(0)); });
}
await app.listen({ host: config.HOST, port: config.PORT });
