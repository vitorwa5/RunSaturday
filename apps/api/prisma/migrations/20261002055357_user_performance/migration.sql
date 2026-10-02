-- CreateEnum
CREATE TYPE "PerformanceSource" AS ENUM ('MANUAL', 'CSV', 'PARKRUN_API', 'GARMIN', 'STRAVA');

-- CreateTable
CREATE TABLE "UserPerformance" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "finishTimeSeconds" INTEGER NOT NULL,
    "source" "PerformanceSource" NOT NULL DEFAULT 'MANUAL',
    "externalResultId" TEXT,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserPerformance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserPerformance_userId_date_idx" ON "UserPerformance"("userId", "date");

-- CreateIndex
CREATE INDEX "UserPerformance_eventId_idx" ON "UserPerformance"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "UserPerformance_userId_eventId_date_key" ON "UserPerformance"("userId", "eventId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "UserPerformance_userId_source_externalResultId_key" ON "UserPerformance"("userId", "source", "externalResultId");

-- AddForeignKey
ALTER TABLE "UserPerformance" ADD CONSTRAINT "UserPerformance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPerformance" ADD CONSTRAINT "UserPerformance_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
