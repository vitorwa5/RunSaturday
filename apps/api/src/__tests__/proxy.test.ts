import { describe, expect, it } from 'vitest';
import { buildApp } from '../app';
import { loadConfig } from '../config/env';
import { MemoryDataStore } from '../repositories/memory/MemoryDataStore';

describe('explicit trusted proxy configuration', () => {
  it('rejects trust-all, hop-count, hostname, malformed and zero-prefix configuration', () => {
    for (const TRUSTED_PROXY_CIDRS of ['true', '1', '*', 'loopback', 'proxy.example.com', '0.0.0.0/0', '::/0', '10.0.0.0/33', '::1/129', '127.0.0.1,', 'bad']) {
      expect(() => loadConfig({ APP_MODE: 'demo', DATA_SOURCE: 'demo', TRUSTED_PROXY_CIDRS })).toThrow(/TRUSTED_PROXY_CIDRS/);
    }
  });
  it('ignores spoofed forwarding headers unless the immediate peer is explicitly trusted', async () => {
    for (const TRUSTED_PROXY_CIDRS of ['', '10.50.0.0/24', '::ffff:10.50.0.0/120']) {
      const app = await buildApp({ config: loadConfig({ APP_MODE: 'demo', DATA_SOURCE: 'demo', TRUSTED_PROXY_CIDRS }), store: new MemoryDataStore('2026-10-01'), logger: false });
      app.get('/test-ip', (request) => ({ ip: request.ip }));
      try {
        const headers = { 'x-forwarded-for': '203.0.113.12', 'x-compass-client-ip': '203.0.113.99' };
        expect((await app.inject({ url: '/test-ip', remoteAddress: '192.0.2.8', headers })).json().ip).toBe('192.0.2.8');
        expect((await app.inject({ url: '/test-ip', remoteAddress: '10.50.0.4', headers })).json().ip).toBe(TRUSTED_PROXY_CIDRS ? '203.0.113.12' : '10.50.0.4');
        expect((await app.inject({ url: '/test-ip', remoteAddress: '10.50.0.4', headers: { 'x-forwarded-for': '203.0.113.99, 192.0.2.8' } })).json().ip).toBe(TRUSTED_PROXY_CIDRS ? '192.0.2.8' : '10.50.0.4');
      } finally { await app.close(); }
    }
  });
  it('rejects IPv4-mapped and combined trust-all ranges in beta', () => {
    const beta = { APP_MODE: 'beta', NODE_ENV: 'test', DATABASE_URL: 'postgresql://example.invalid/db', AUTH_BASE_URL: 'https://example.test', AUTH_SECRET: 'test-only-proxy-secret-at-least-32-characters', EMAIL_TRANSPORT: 'test' };
    expect(() => loadConfig({ ...beta, TRUSTED_PROXY_CIDRS: '::ffff:10.50.0.0/120' })).not.toThrow();
    for (const TRUSTED_PROXY_CIDRS of ['::ffff:0.0.0.0/96', '0:0:0:0:0:ffff:0:0/96', '::/32', '0.0.0.0/1,128.0.0.0/1', '::ffff:0.0.0.0/97,::ffff:128.0.0.0/97']) {
      expect(() => loadConfig({ ...beta, TRUSTED_PROXY_CIDRS })).toThrow(/TRUSTED_PROXY_CIDRS/);
    }
  });
});
