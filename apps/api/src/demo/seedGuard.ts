import type { Db } from '../db/prisma';

export function requireDemoSeedOptIn(env: NodeJS.ProcessEnv) {
  if (env.APP_MODE !== 'demo' || env.NODE_ENV === 'production' || env.ALLOW_DESTRUCTIVE_DEMO_SEED !== 'true') {
    throw new Error('Demo seed requires APP_MODE=demo, a non-production environment and ALLOW_DESTRUCTIVE_DEMO_SEED=true. Beta uses migrations only.');
  }
}

/** Fail closed before any destructive statement; only the known fictional account is eligible. */
export async function assertDemoSeedDatabase(db: Db) {
  const [unexpectedUser, sessions, accounts, importedEvents] = await Promise.all([
    db.user.findFirst({ where: { OR: [{ id: { not: 'demo-user' } }, { isDemo: false }, { email: { not: null } }, { emailVerified: true }] }, select: { id: true } }),
    db.session.count(), db.account.count(),
    db.event.count({ where: { source: 'IMPORTED' } }),
  ]);
  if (unexpectedUser || sessions || accounts || importedEvents) throw new Error('Demo seed refused: database contains non-demo users, authentication identities/sessions or imported catalogue data. No data was deleted.');
}
