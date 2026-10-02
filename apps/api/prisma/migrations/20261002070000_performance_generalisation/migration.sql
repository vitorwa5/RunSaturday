-- Phase 4A.1: generalise UserPerformance beyond parkrun (additive; existing ids and data kept).

-- CreateEnum
CREATE TYPE "PerformanceType" AS ENUM ('PARKRUN', 'ROAD_RACE', 'OTHER_RACE');

-- New columns. Every existing row is a 5000 m parkrun at a known event.
ALTER TABLE "UserPerformance"
  ADD COLUMN "distanceMeters" INTEGER NOT NULL DEFAULT 5000,
  ADD COLUMN "performanceType" "PerformanceType" NOT NULL DEFAULT 'PARKRUN',
  ADD COLUMN "externalEventName" TEXT,
  ADD COLUMN "duplicateKey" TEXT;

-- Backfill the deterministic duplicate key (same format as services/performanceKey.ts).
UPDATE "UserPerformance"
SET "duplicateKey" = 'event:' || "eventId" || '|' || to_char("date", 'YYYY-MM-DD') || '|' || "distanceMeters";

ALTER TABLE "UserPerformance" ALTER COLUMN "duplicateKey" SET NOT NULL;

-- eventId becomes optional: an external race is stored by name, never as a fake Event row.
ALTER TABLE "UserPerformance" ALTER COLUMN "eventId" DROP NOT NULL;

-- Exactly one of eventId / externalEventName; positive distance.
ALTER TABLE "UserPerformance"
  ADD CONSTRAINT "UserPerformance_location_check"
    CHECK (("eventId" IS NOT NULL) <> ("externalEventName" IS NOT NULL)),
  ADD CONSTRAINT "UserPerformance_distance_check" CHECK ("distanceMeters" > 0);

-- Replace (userId, eventId, date) uniqueness, which a NULL eventId would bypass, with the key.
DROP INDEX "UserPerformance_userId_eventId_date_key";
CREATE UNIQUE INDEX "UserPerformance_userId_duplicateKey_key" ON "UserPerformance"("userId", "duplicateKey");
