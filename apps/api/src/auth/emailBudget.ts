import type { Db } from '../db/prisma';
import { AppError } from '../http/errors';

const WINDOW_MS = 600_000;
const LIMITS = { send: 5, verify: 15 } as const;

/** Product budgets have their own expiry and must never share Better Auth's RateLimit table. */
export async function consumeEmailBudget(db: Db, email: string, action: keyof typeof LIMITS, now = new Date()) {
  // Indexed, request-driven cleanup removes only fully expired product windows.
  await db.emailAuthBudget.deleteMany({ where: { expiresAt: { lte: now } } });
  const key = `email:${email}:${action}`;
  const expiresAt = new Date(now.getTime() + WINDOW_MS);
  const rows = await db.$queryRaw<{ count: number }[]>`
    INSERT INTO "EmailAuthBudget" (key, email, count, "windowStartedAt", "expiresAt")
    VALUES (${key}, ${email}, 1, ${now}, ${expiresAt})
    ON CONFLICT (key) DO UPDATE SET
      count = CASE WHEN "EmailAuthBudget"."expiresAt" <= ${now} THEN 1 ELSE "EmailAuthBudget".count + 1 END,
      "windowStartedAt" = CASE WHEN "EmailAuthBudget"."expiresAt" <= ${now} THEN ${now} ELSE "EmailAuthBudget"."windowStartedAt" END,
      "expiresAt" = CASE WHEN "EmailAuthBudget"."expiresAt" <= ${now} THEN ${expiresAt} ELSE "EmailAuthBudget"."expiresAt" END
    RETURNING count`;
  if (rows[0]!.count > LIMITS[action]) throw new AppError(429, 'too_many_attempts', 'Too many attempts. Wait ten minutes before trying again.');
}
