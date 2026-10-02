-- AlterTable
ALTER TABLE "User" ADD COLUMN     "lifetimePbEventId" TEXT,
ADD COLUMN     "recentPbEventId" TEXT;

-- CreateTable
CREATE TABLE "CourseFactorSnapshot" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "windowDays" INTEGER NOT NULL,
    "asOfDate" DATE NOT NULL,
    "factor" DOUBLE PRECISION,
    "logFactor" DOUBLE PRECISION,
    "bootstrapLogFactors" DOUBLE PRECISION[],
    "matchedRunners" INTEGER NOT NULL,
    "comparisons" INTEGER NOT NULL,
    "connectedEvents" INTEGER NOT NULL,
    "medianGapDays" DOUBLE PRECISION,
    "dispersion" DOUBLE PRECISION,
    "confidence" "ConfidenceLevel" NOT NULL,
    "confidenceScore" INTEGER NOT NULL,
    "breakdown" JSONB NOT NULL,
    "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CourseFactorSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CourseFactorSnapshot_version_windowDays_asOfDate_idx" ON "CourseFactorSnapshot"("version", "windowDays", "asOfDate");

-- CreateIndex
CREATE UNIQUE INDEX "CourseFactorSnapshot_eventId_version_windowDays_asOfDate_key" ON "CourseFactorSnapshot"("eventId", "version", "windowDays", "asOfDate");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_lifetimePbEventId_fkey" FOREIGN KEY ("lifetimePbEventId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_recentPbEventId_fkey" FOREIGN KEY ("recentPbEventId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseFactorSnapshot" ADD CONSTRAINT "CourseFactorSnapshot_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
