import { describe, expect, it } from 'vitest';
import { CatalogueEnvelopeSchema, EventCatalogueRecordSchema, EventCatalogueSourceSchema } from '../catalogue/schema';
import { catalogueMode } from '../catalogue/policy';
const record = { externalId: '0007', name: 'Synthetic Saturday 5K', countryCode: 'GB', latitude: 54, longitude: -3, timezone: 'Europe/London', active: true };
describe('provider-neutral catalogue contract', () => {
  it('keeps optional facts unknown and the external identity as a string', () => {
    expect(EventCatalogueRecordSchema.parse(record)).toMatchObject({ externalId: '0007', town: null, startTime: null, sourceUpdatedAt: null, subdivisionCode: null });
    expect(EventCatalogueRecordSchema.parse(record)).not.toHaveProperty('elevationM');
  });
  it.each(['GB-ENG', 'GB-SCT', 'GB-WLS', 'GB-NIR'])('represents %s without an England-only domain', (subdivisionCode) => {
    expect(EventCatalogueRecordSchema.safeParse({ ...record, subdivisionCode }).success).toBe(true);
  });
  it.each([
    { externalId: '' }, { externalId: 7 }, { name: ' ' }, { name: ' Synthetic' }, { countryCode: 'England' }, { countryCode: 'ZZ' },
    { latitude: 90.01 }, { latitude: Number.NaN }, { longitude: -180.01 }, { longitude: Infinity },
    { timezone: 'Europe/Invented' }, { timezone: '+01:00' }, { timezone: undefined }, { active: 'true' },
    { sourceUrl: 'javascript:alert(1)' }, { officialUrl: 'https://secret:password@example.test' },
    { startTime: '24:00' }, { startTime: '09:60' }, { sourceUpdatedAt: '2026-10-03' },
    { subdivisionCode: 'US-CA' }, { courseType: 'one_lap' },
  ])('rejects malformed/unsupported catalogue facts: %j', (change) => {
    expect(EventCatalogueRecordSchema.safeParse({ ...record, ...change }).success).toBe(false);
  });
  it('validates source namespaces, attribution, safe references and reserved demo classification', () => {
    const source = { namespace: 'approved.manual-v1', kind: 'imported', attribution: 'Synthetic test source', referenceUrl: 'https://example.test/catalogue' };
    expect(EventCatalogueSourceSchema.safeParse(source).success).toBe(true);
    for (const change of [{ namespace: '' }, { namespace: 'Provider' }, { namespace: 'demo.fixture' }, { attribution: '' }, { referenceUrl: 'ftp://example.test' }, { licence: 'javascript:invalid' }, { licence: 'https://key:secret@example.test/terms' }, { apiKey: 'secret' }]) {
      expect(EventCatalogueSourceSchema.safeParse({ ...source, ...change }).success).toBe(false);
    }
    expect(EventCatalogueSourceSchema.safeParse({ namespace: 'demo.synthetic', kind: 'demo', attribution: 'Fictional fixtures' }).success).toBe(true);
    expect(CatalogueEnvelopeSchema.safeParse({ format: 'wrong', source, records: [record] }).success).toBe(false);
  });
  it('requires an explicit job mode and forbids production demo mode', () => {
    expect(catalogueMode({ APP_MODE: 'beta', NODE_ENV: 'production' })).toBe('beta');
    expect(catalogueMode({ APP_MODE: 'demo' })).toBe('demo');
    expect(() => catalogueMode({})).toThrow(/explicit/);
    expect(() => catalogueMode({ APP_MODE: 'demo', NODE_ENV: 'production' })).toThrow(/production/);
  });
  it.each([
    ['https://example.test/catalogue', true], ['http://example.test/catalogue', true],
    ['not a URL', false], ['https://', false], [' ', false], [' https://example.test ', false],
    ['javascript:alert(1)', false], ['https://user:password@', false], ['http://[invalid', false],
    ['https://user:password@example.test', false],
  ])('returns structured URL validation for %j without throwing', (sourceUrl, valid) => {
    let result!: ReturnType<typeof EventCatalogueRecordSchema.safeParse>;
    expect(() => { result = EventCatalogueRecordSchema.safeParse({ ...record, sourceUrl }); }).not.toThrow();
    expect(result.success).toBe(valid);
    if (!result.success) expect(result.error.issues.some((issue) => issue.path.join('.') === 'sourceUrl')).toBe(true);
    expect(() => EventCatalogueSourceSchema.safeParse({ namespace: 'test.provider', kind: 'imported', attribution: 'Test fixture', referenceUrl: sourceUrl })).not.toThrow();
  });

  it('accepts missing optional URLs as unknown', () => {
    expect(EventCatalogueRecordSchema.parse(record)).toMatchObject({ sourceUrl: null, officialUrl: null });
  });

});
