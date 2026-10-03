import type { Prisma } from '../generated/prisma/client';
export type CatalogueMode = 'demo' | 'beta';
/** A legacy IMPORTED label without source identity is not production provenance. */
export function catalogueWhere(mode: CatalogueMode): Prisma.EventWhereInput {
  return mode === 'demo' ? { source: 'DEMO' } : { source: 'IMPORTED', sourceNamespace: { not: null }, externalId: { not: null } };
}
export function catalogueMode(env: NodeJS.ProcessEnv): CatalogueMode {
  if (!['demo', 'beta'].includes(env.APP_MODE ?? '') || (env.NODE_ENV === 'production' && env.APP_MODE !== 'beta')) {
    throw new Error('Catalogue jobs require explicit APP_MODE=demo|beta; production requires beta');
  }
  return env.APP_MODE as CatalogueMode;
}
export const evidenceScope = (mode: CatalogueMode) => mode === 'beta' ? 'BETA_IMPORTED_V1' : 'DEMO';
