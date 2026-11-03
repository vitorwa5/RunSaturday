// Pure local fixture generation. No database client, imports or network calls.
export function syntheticCatalogue() {
  return {
    format: '5k-compass-catalogue-v1',
    source: { namespace: 'synthetic.private', kind: 'imported', attribution: 'Synthetic private test catalogue; fictional locations, not real events', licence: 'Synthetic test fixtures only' },
    records: [
      { externalId: 'synthetic-london', name: 'Synthetic London Test 5K', countryCode: 'GB', region: 'Synthetic London', town: 'Synthetic Town', latitude: 51.51, longitude: -0.12, timezone: 'Europe/London', startTime: '09:00', active: true },
      { externalId: 'synthetic-lisbon', name: 'Synthetic Lisbon Test 5K', countryCode: 'PT', region: 'Synthetic Lisbon', town: 'Synthetic Town', latitude: 38.72, longitude: -9.14, timezone: 'Europe/Lisbon', startTime: '09:00', active: true },
    ],
  };
}
export function validateSyntheticCatalogue(value) {
  if (value?.format !== '5k-compass-catalogue-v1' || value.source?.namespace !== 'synthetic.private' || value.source?.kind !== 'imported' || !value.source?.attribution.startsWith('Synthetic ') || !Array.isArray(value.records) || value.records.length !== 2) throw new Error('Synthetic fixture provenance required');
  for (const row of value.records) {
    if (!row.name.startsWith('Synthetic ') || !row.externalId.startsWith('synthetic-') || !Number.isFinite(row.latitude) || !Number.isFinite(row.longitude) || Object.keys(row).some((k) => !['externalId', 'name', 'countryCode', 'region', 'town', 'latitude', 'longitude', 'timezone', 'startTime', 'active'].includes(k))) throw new Error('Synthetic catalogue-only fields required');
    new Intl.DateTimeFormat('en', { timeZone: row.timezone });
  }
  return value;
}
if (process.argv[1] === new URL(import.meta.url).pathname) {
  if (process.argv.slice(2).some((arg) => arg !== '--dry-run')) { console.error('Only --dry-run supported; no database writes'); process.exitCode = 1; }
  else console.log(JSON.stringify(validateSyntheticCatalogue(syntheticCatalogue()), null, 2));
}
