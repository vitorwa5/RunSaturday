-- Product-specific 10-minute windows must not be pruned by Better Auth's shorter RateLimit cleanup.
CREATE TABLE "EmailAuthBudget" (
    "key" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "windowStartedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EmailAuthBudget_pkey" PRIMARY KEY ("key")
);

CREATE INDEX "EmailAuthBudget_email_idx" ON "EmailAuthBudget"("email");
CREATE INDEX "EmailAuthBudget_expiresAt_idx" ON "EmailAuthBudget"("expiresAt");

-- Preserve surviving B1 email budgets instead of resetting them at deployment.
-- Old RateLimit rows remain available to the old code until Better Auth prunes them.
INSERT INTO "EmailAuthBudget" ("key", "email", "count", "windowStartedAt", "expiresAt")
SELECT "key", regexp_replace(substr("key", 7), ':(send|verify)$', ''), "count",
       to_timestamp("lastRequest"::double precision / 1000.0) AT TIME ZONE 'UTC',
       (to_timestamp("lastRequest"::double precision / 1000.0) AT TIME ZONE 'UTC') + INTERVAL '10 minutes'
FROM "RateLimit"
WHERE "key" ~ '^email:.+:(send|verify)$'
  AND "lastRequest" > EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - INTERVAL '10 minutes')) * 1000;
