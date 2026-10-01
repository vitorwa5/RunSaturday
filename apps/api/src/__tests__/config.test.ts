import { describe, expect, it } from 'vitest';
import { loadConfig } from '../config/env';

describe('loadConfig', () => {
  it('applies defaults', () => {
    const config = loadConfig({ DATA_SOURCE: 'demo' });
    expect(config.PORT).toBe(3001);
    expect(config.CORS_ORIGINS).toContain('http://localhost:5173');
  });

  it('requires DATABASE_URL in database mode', () => {
    expect(() => loadConfig({ DATA_SOURCE: 'database' })).toThrow(/DATABASE_URL is required/);
  });

  it('rejects invalid values with a readable message', () => {
    expect(() => loadConfig({ DATA_SOURCE: 'demo', PORT: 'abc' })).toThrow(/PORT/);
  });
});
