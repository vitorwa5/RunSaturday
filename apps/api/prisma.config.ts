import { defineConfig } from 'prisma/config';

// Prisma 7 no longer loads .env automatically.
try {
  process.loadEnvFile();
} catch {
  // No .env file: rely on the real environment (CI, containers).
}

const databaseUrl = process.env.DATABASE_URL;

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  // `prisma generate` needs no database, so only configure the datasource when a URL exists.
  // Commands that do need it (migrate, seed) then fail with a clear "missing datasource" error.
  ...(databaseUrl ? { datasource: { url: databaseUrl } } : {}),
});
