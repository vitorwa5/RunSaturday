import { describe, expect, it } from 'vitest';
import { loadConfig } from '../config/env';

describe('loadConfig', () => {
  it('applies defaults', () => {
    const config = loadConfig({ APP_MODE: 'demo', DATA_SOURCE: 'demo' });
    expect(config.PORT).toBe(3001);
    expect(config.CORS_ORIGINS).toContain('http://localhost:5173');
  });

  it('requires DATABASE_URL in database mode', () => {
    expect(() => loadConfig({ APP_MODE: 'demo', DATA_SOURCE: 'database' })).toThrow(/DATABASE_URL is required/);
  });

  it('rejects invalid values with a readable message', () => {
    expect(() => loadConfig({ APP_MODE: 'demo', DATA_SOURCE: 'demo', PORT: 'abc' })).toThrow(/PORT/);
  });
});

describe('explicit B1 mode boundary', () => {
  const beta = { APP_MODE: 'beta', NODE_ENV: 'test', DATABASE_URL: 'postgresql://example.invalid/db', AUTH_BASE_URL: 'http://localhost:5173', AUTH_ALLOW_INSECURE_LOCAL_HTTP: 'true', AUTH_SECRET: 'test-secret-with-at-least-32-characters', EMAIL_TRANSPORT: 'test' };
  it('requires an explicit application mode', () => expect(() => loadConfig({ DATA_SOURCE: 'demo' })).toThrow(/APP_MODE/));
  it('requires persistent storage and authentication configuration', () => {
    expect(() => loadConfig({ ...beta, DATA_SOURCE: 'demo' })).toThrow(/Beta requires PostgreSQL/);
    expect(() => loadConfig({ ...beta, AUTH_SECRET: undefined })).toThrow(/AUTH_SECRET/);
    expect(() => loadConfig({ ...beta, AUTH_BASE_URL: undefined })).toThrow(/AUTH_BASE_URL/);
    expect(() => loadConfig({ ...beta, AUTH_SECRET: 'weak' })).toThrow(/AUTH_SECRET/);
  });
  it('requires real delivery outside test and HTTPS/real mode in production', () => {
    expect(() => loadConfig({ ...beta, NODE_ENV: 'development' })).toThrow(/Test delivery/);
    expect(() => loadConfig({ ...beta, NODE_ENV: 'production' })).toThrow(/HTTPS/);
    expect(() => loadConfig({ APP_MODE: 'demo', DATA_SOURCE: 'demo', NODE_ENV: 'production' })).toThrow(/Production requires/);
    expect(() => loadConfig({ ...beta, EMAIL_TRANSPORT: 'resend' })).toThrow(/real email delivery/);
    expect(loadConfig({ ...beta, NODE_ENV: 'production', AUTH_BASE_URL: 'https://5k.example', AUTH_ALLOW_INSECURE_LOCAL_HTTP: 'false', EMAIL_TRANSPORT: 'resend', EMAIL_API_KEY: 'test-provider-key', EMAIL_FROM: '5K <auth@example.test>' }).APP_MODE).toBe('beta');
  });

  it('requires HTTPS in public beta independently of NODE_ENV', () => {
    const publicBeta = { ...beta, NODE_ENV: undefined, EMAIL_TRANSPORT: 'resend', EMAIL_API_KEY: 'test-key', EMAIL_FROM: 'auth@example.test', AUTH_ALLOW_INSECURE_LOCAL_HTTP: undefined };
    expect(loadConfig({ ...publicBeta, AUTH_BASE_URL: 'https://example.com' }).NODE_ENV).toBe('development');
    for (const AUTH_BASE_URL of ['http://example.com', 'http://localhost:5173', 'ftp://example.com']) {
      expect(() => loadConfig({ ...publicBeta, AUTH_BASE_URL })).toThrow(/Beta requires HTTPS/);
    }
    expect(() => loadConfig({ ...publicBeta, AUTH_BASE_URL: 'http://example.com', AUTH_ALLOW_INSECURE_LOCAL_HTTP: 'true' })).toThrow(/Beta requires HTTPS/);
  });

  it('allows HTTP only with explicit opt-in and an exact loopback host outside production', () => {
    for (const AUTH_BASE_URL of ['http://localhost:5173', 'http://127.0.0.1:5175', 'http://[::1]:5173']) {
      expect(loadConfig({ ...beta, AUTH_BASE_URL }).AUTH_BASE_URL).toBe(AUTH_BASE_URL);
      expect(() => loadConfig({ ...beta, AUTH_BASE_URL, AUTH_ALLOW_INSECURE_LOCAL_HTTP: 'false' })).toThrow(/HTTPS/);
    }
    for (const AUTH_BASE_URL of ['http://localhost.example.com', 'http://127.0.0.1.example.com', 'http://192.168.1.2', 'http://user:password@localhost:5173']) {
      expect(() => loadConfig({ ...beta, AUTH_BASE_URL })).toThrow(/HTTPS/);
    }
    expect(() => loadConfig({ ...beta, NODE_ENV: 'production', AUTH_BASE_URL: 'https://example.com' })).toThrow(/Production forbids/);
  });
});
