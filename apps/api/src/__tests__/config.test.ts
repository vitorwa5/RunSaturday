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
  const beta = { APP_MODE: 'beta', NODE_ENV: 'test', DATABASE_URL: 'postgresql://example.invalid/db', AUTH_BASE_URL: 'http://localhost:5173', AUTH_SECRET: 'test-secret-with-at-least-32-characters', EMAIL_TRANSPORT: 'test' };
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
    expect(loadConfig({ ...beta, NODE_ENV: 'production', AUTH_BASE_URL: 'https://5k.example', EMAIL_TRANSPORT: 'resend', EMAIL_API_KEY: 'test-provider-key', EMAIL_FROM: '5K <auth@example.test>' }).APP_MODE).toBe('beta');
  });
});
