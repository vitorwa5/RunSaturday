-- Additive: existing accounts remain incomplete; no personal history/location is inferred.
ALTER TABLE "User" ADD COLUMN "onboardingCompletedAt" TIMESTAMP(3);
UPDATE "User" SET "onboardingCompletedAt" = "createdAt" WHERE "isDemo" = true;
