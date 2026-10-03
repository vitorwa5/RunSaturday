import { readFile, stat } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { resolve } from 'node:path';
import { CatalogueImportService } from '../src/catalogue/importService';
import { CatalogueInputError } from '../src/catalogue/schema';
import { catalogueMode } from '../src/catalogue/policy';
import { createPrismaClient } from '../src/db/prisma';

async function main() {
  const { values } = parseArgs({ options: { file: { type: 'string' }, 'dry-run': { type: 'boolean', default: false } }, strict: true, allowPositionals: false });
  if (!values.file || /^[a-z]+:\/\//i.test(values.file)) throw new Error('Use --file with a local JSON path; network sources are not supported');
  const mode = catalogueMode(process.env);
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  const path = resolve(values.file);
  if ((await stat(path)).size > 10 * 1024 * 1024) throw new Error('Catalogue JSON exceeds the 10 MiB local import limit');
  const input: unknown = JSON.parse(await readFile(path, 'utf8'));
  const db = createPrismaClient(process.env.DATABASE_URL);
  try {
    const summary = await new CatalogueImportService(db, mode).import(input, { dryRun: values['dry-run'] });
    console.log(JSON.stringify(summary, null, 2));
    if (summary.rejected) process.exitCode = 2;
  } finally { await db.$disconnect(); }
}
main().catch((error) => {
  console.error(JSON.stringify(error instanceof CatalogueInputError ? { error: 'invalid_catalogue', issues: error.issues } : { error: 'catalogue_import_failed', message: 'Check the local file, application mode, database and migrations.' }));
  process.exitCode = 1;
});
