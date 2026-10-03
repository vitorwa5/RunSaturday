import { createHash } from 'node:crypto';
import type { Db } from '../db/prisma';
import type { Prisma } from '../generated/prisma/client';
import type { CatalogueMode } from './policy';
import { CatalogueEnvelopeSchema, CatalogueInputError, EventCatalogueRecordSchema, catalogueIssues, type CatalogueIssue, type EventCatalogueRecord, type EventCatalogueSource } from './schema';

export interface CatalogueRejection { index: number; externalId: string | null; issues: CatalogueIssue[] }
export interface CatalogueImportSummary {
  runId: string | null; dryRun: boolean; sourceNamespace: string;
  received: number; created: number; updated: number; unchanged: number; deactivated: number; rejected: number;
  rejections: CatalogueRejection[];
}
const countryNames = new Intl.DisplayNames(['en'], { type: 'region' });
/** Name is mutable; even the generated URL slug is anchored to external identity. */
export const catalogueSlug = (namespace: string, externalId: string) => `catalogue-${createHash('sha256').update(JSON.stringify([namespace, externalId])).digest('hex')}`;
function eventData(source: EventCatalogueSource, record: EventCatalogueRecord) {
  return {
    name: record.name, country: countryNames.of(record.countryCode)!, countryCode: record.countryCode,
    subdivisionCode: record.subdivisionCode, region: record.region, town: record.town,
    latitude: record.latitude, longitude: record.longitude, timezone: record.timezone, active: record.active,
    startTime: record.startTime, startLocationText: record.startLocationText, officialUrl: record.officialUrl,
    sourceUrl: record.sourceUrl ?? source.referenceUrl, sourceAttribution: source.attribution, sourceLicence: source.licence,
    sourceUpdatedAt: record.sourceUpdatedAt ? new Date(record.sourceUpdatedAt) : null,
  };
}
function changed(existing: Record<string, unknown>, next: Record<string, unknown>) {
  return Object.entries(next).some(([key, value]) => {
    const old = existing[key]; return old instanceof Date || value instanceof Date ? (old instanceof Date ? old.getTime() : old) !== (value instanceof Date ? value.getTime() : value) : old !== value;
  });
}

/** Local/adapted records only. No network I/O, result ingestion or personal-data operations. */
export class CatalogueImportService {
  constructor(private readonly db: Db, private readonly mode: CatalogueMode, private readonly now = () => new Date()) {}
  async import(input: unknown, options: { dryRun?: boolean } = {}): Promise<CatalogueImportSummary> {
    const envelope = CatalogueEnvelopeSchema.safeParse(input);
    if (!envelope.success) throw new CatalogueInputError(catalogueIssues(envelope.error));
    const { source, records } = envelope.data;
    if (this.mode === 'beta' && source.kind === 'demo') throw new CatalogueInputError([{ path: 'source.kind', code: 'demo_forbidden', message: 'Beta cannot import demo catalogue records' }]);
    const summary: CatalogueImportSummary = { runId: null, dryRun: options.dryRun === true, sourceNamespace: source.namespace, received: records.length, created: 0, updated: 0, unchanged: 0, deactivated: 0, rejected: 0, rejections: [] };
    const accepted: { index: number; record: EventCatalogueRecord }[] = [];
    const seen = new Set<string>();
    for (const [index, raw] of records.entries()) {
      const parsed = EventCatalogueRecordSchema.safeParse(raw);
      if (!parsed.success) {
        const id = raw && typeof raw === 'object' && 'externalId' in raw && typeof raw.externalId === 'string' ? raw.externalId.slice(0, 200) : null;
        summary.rejections.push({ index, externalId: id, issues: catalogueIssues(parsed.error) }); continue;
      }
      if (seen.has(parsed.data.externalId)) summary.rejections.push({ index, externalId: parsed.data.externalId, issues: [{ path: 'externalId', code: 'duplicate_external_id', message: 'Repeated external identity in this import' }] });
      else { seen.add(parsed.data.externalId); accepted.push({ index, record: parsed.data }); }
    }
    const importedAt = this.now();
    return this.db.$transaction(async (tx) => {
      // Serialise imports of one provider across processes; no check-then-insert race.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${source.namespace}, 0))`;
      const sourceDb = source.kind === 'demo' ? 'DEMO' : 'IMPORTED';
      const run = summary.dryRun ? null : await tx.catalogueImportRun.create({ data: {
        sourceNamespace: source.namespace, source: sourceDb, sourceAttribution: source.attribution,
        sourceUrl: source.referenceUrl, sourceLicence: source.licence, startedAt: importedAt, received: records.length, rejections: [],
      } });
      summary.runId = run?.id ?? null;
      for (const { index, record } of accepted) {
        const identity = { sourceNamespace: source.namespace, externalId: record.externalId };
        const existing = await tx.event.findUnique({ where: { sourceNamespace_externalId: identity } });
        if (existing && existing.source !== sourceDb) {
          summary.rejections.push({ index, externalId: record.externalId, issues: [{ path: 'source.kind', code: 'source_kind_conflict', message: 'Existing identity has a different source classification' }] }); continue;
        }
        const next = eventData(source, record);
        if (!existing) summary.created++;
        else if (existing.active && !record.active) summary.deactivated++;
        else if (changed(existing, next)) summary.updated++;
        else summary.unchanged++;
        if (!summary.dryRun) {
          const provenance = { importedAt, catalogueImportRunId: run!.id };
          if (existing) await tx.event.update({ where: { id: existing.id }, data: { ...next, ...provenance } });
          else await tx.event.create({ data: { ...identity, ...next, ...provenance, source: sourceDb, slug: catalogueSlug(source.namespace, record.externalId) } });
        }
      }
      summary.rejections.sort((a, b) => a.index - b.index); summary.rejected = summary.rejections.length;
      if (run) await tx.catalogueImportRun.update({ where: { id: run.id }, data: {
        completedAt: this.now(), created: summary.created, updated: summary.updated, unchanged: summary.unchanged,
        deactivated: summary.deactivated, rejected: summary.rejected, rejections: summary.rejections as unknown as Prisma.InputJsonValue,
      } });
      return summary;
    }, { timeout: 120_000 });
  }
}
