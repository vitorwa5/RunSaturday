-- Phase 1.1: EventScore becomes a snapshot keyed by
-- (eventId, calculationVersion, windowDays, asOfDate), so several analysis windows and
-- historical snapshots can coexist for the same event and calculation version.

-- DropIndex
DROP INDEX "EventScore_calculationVersion_idx";

-- DropIndex
DROP INDEX "EventScore_eventId_calculationVersion_key";

-- AlterTable: add asOfDate without breaking existing rows.
ALTER TABLE "EventScore" ADD COLUMN "asOfDate" DATE;

-- Backfill: rows created before this migration have no recorded data cut-off, so use the
-- UTC calendar date they were calculated on (the closest information available).
UPDATE "EventScore" SET "asOfDate" = ("calculatedAt" AT TIME ZONE 'UTC')::date WHERE "asOfDate" IS NULL;

ALTER TABLE "EventScore" ALTER COLUMN "asOfDate" SET NOT NULL;

-- windowDays is now part of the identity and must always be given explicitly.
ALTER TABLE "EventScore" ALTER COLUMN "windowDays" DROP DEFAULT;

-- CreateIndex
CREATE INDEX "EventScore_calculationVersion_windowDays_asOfDate_idx" ON "EventScore"("calculationVersion", "windowDays", "asOfDate");

-- CreateIndex
CREATE UNIQUE INDEX "EventScore_eventId_calculationVersion_windowDays_asOfDate_key" ON "EventScore"("eventId", "calculationVersion", "windowDays", "asOfDate");
