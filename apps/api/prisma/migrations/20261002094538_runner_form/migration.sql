-- CreateEnum
CREATE TYPE "RunnerFormStatus" AS ENUM ('ESTIMATE', 'INDICATIVE', 'UNAVAILABLE');

-- CreateEnum
CREATE TYPE "FormTrend" AS ENUM ('IMPROVING', 'STABLE', 'DECLINING', 'LIMITED');

-- CreateTable
CREATE TABLE "RunnerFormSnapshot" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "distanceMeters" INTEGER NOT NULL,
    "status" "RunnerFormStatus" NOT NULL,
    "formSeconds" INTEGER,
    "indicativeSeconds" INTEGER,
    "confidenceScore" INTEGER NOT NULL,
    "confidence" "ConfidenceLevel" NOT NULL,
    "trend" "FormTrend" NOT NULL,
    "sampleSize" INTEGER NOT NULL,
    "eventCount" INTEGER NOT NULL,
    "asOfDate" DATE NOT NULL,
    "calculationVersion" TEXT NOT NULL,
    "components" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RunnerFormSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RunnerFormSnapshot_userId_distanceMeters_asOfDate_idx" ON "RunnerFormSnapshot"("userId", "distanceMeters", "asOfDate");

-- CreateIndex
CREATE UNIQUE INDEX "RunnerFormSnapshot_userId_distanceMeters_calculationVersion_key" ON "RunnerFormSnapshot"("userId", "distanceMeters", "calculationVersion", "asOfDate");

-- AddForeignKey
ALTER TABLE "RunnerFormSnapshot" ADD CONSTRAINT "RunnerFormSnapshot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
