-- CreateEnum
CREATE TYPE "DataSource" AS ENUM ('DEMO', 'IMPORTED');

-- CreateEnum
CREATE TYPE "Surface" AS ENUM ('TARMAC', 'TRAIL', 'GRASS', 'MIXED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "CourseType" AS ENUM ('ONE_LAP', 'TWO_LAPS', 'THREE_PLUS_LAPS', 'OUT_AND_BACK', 'POINT_TO_POINT', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "FacilityStatus" AS ENUM ('YES', 'NO', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "OccurrenceStatus" AS ENUM ('SCHEDULED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DataQuality" AS ENUM ('UNVALIDATED', 'VALID', 'PARTIAL', 'REJECTED');

-- CreateEnum
CREATE TYPE "Goal" AS ENUM ('PB', 'PLACE', 'HIDDEN_GEM', 'NEW_EVENT', 'QUIET', 'CHALLENGE');

-- CreateEnum
CREATE TYPE "ConfidenceLevel" AS ENUM ('HIGH', 'MEDIUM', 'LOW', 'INSUFFICIENT');

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "region" TEXT,
    "town" TEXT,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "startLocationText" TEXT,
    "startTime" TEXT,
    "courseType" "CourseType" NOT NULL DEFAULT 'UNKNOWN',
    "surface" "Surface" NOT NULL DEFAULT 'UNKNOWN',
    "laps" INTEGER,
    "elevationM" INTEGER,
    "parking" "FacilityStatus" NOT NULL DEFAULT 'UNKNOWN',
    "toilets" "FacilityStatus" NOT NULL DEFAULT 'UNKNOWN',
    "cafe" "FacilityStatus" NOT NULL DEFAULT 'UNKNOWN',
    "dogs" "FacilityStatus" NOT NULL DEFAULT 'UNKNOWN',
    "buggies" "FacilityStatus" NOT NULL DEFAULT 'UNKNOWN',
    "accessibility" "FacilityStatus" NOT NULL DEFAULT 'UNKNOWN',
    "officialUrl" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "source" "DataSource" NOT NULL DEFAULT 'IMPORTED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventOccurrence" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "participantCount" INTEGER,
    "winnerTimeSeconds" INTEGER,
    "thirdTimeSeconds" INTEGER,
    "fifthTimeSeconds" INTEGER,
    "tenthTimeSeconds" INTEGER,
    "status" "OccurrenceStatus" NOT NULL DEFAULT 'COMPLETED',
    "dataQuality" "DataQuality" NOT NULL DEFAULT 'UNVALIDATED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventOccurrence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Result" (
    "id" TEXT NOT NULL,
    "occurrenceId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "finishTimeSeconds" INTEGER NOT NULL,
    "athleteKey" TEXT,
    "ageGrade" DOUBLE PRECISION,

    CONSTRAINT "Result_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "homeLat" DOUBLE PRECISION,
    "homeLon" DOUBLE PRECISION,
    "homeLabel" TEXT,
    "defaultTravelMinutes" INTEGER NOT NULL DEFAULT 30,
    "lifetimePbSeconds" INTEGER,
    "recentPbSeconds" INTEGER,
    "current5kEstimateSeconds" INTEGER,
    "preferredGoal" "Goal" NOT NULL DEFAULT 'PB',
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserEvent" (
    "userId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "visited" BOOLEAN NOT NULL DEFAULT false,
    "favourite" BOOLEAN NOT NULL DEFAULT false,
    "visitCount" INTEGER NOT NULL DEFAULT 0,
    "personalBestSeconds" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserEvent_pkey" PRIMARY KEY ("userId","eventId")
);

-- CreateTable
CREATE TABLE "EventScore" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "pbScore" DOUBLE PRECISION,
    "difficultyScore" DOUBLE PRECISION,
    "competitionScore" DOUBLE PRECISION,
    "gemBaseScore" DOUBLE PRECISION,
    "pbConfidence" "ConfidenceLevel" NOT NULL DEFAULT 'INSUFFICIENT',
    "competitionConfidence" "ConfidenceLevel" NOT NULL DEFAULT 'INSUFFICIENT',
    "components" JSONB,
    "averageParticipants" DOUBLE PRECISION,
    "sampleSize" INTEGER NOT NULL DEFAULT 0,
    "windowDays" INTEGER NOT NULL DEFAULT 90,
    "calculationVersion" TEXT NOT NULL,
    "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventScore_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Event_slug_key" ON "Event"("slug");

-- CreateIndex
CREATE INDEX "Event_region_idx" ON "Event"("region");

-- CreateIndex
CREATE INDEX "Event_active_idx" ON "Event"("active");

-- CreateIndex
CREATE INDEX "EventOccurrence_date_idx" ON "EventOccurrence"("date");

-- CreateIndex
CREATE UNIQUE INDEX "EventOccurrence_eventId_date_key" ON "EventOccurrence"("eventId", "date");

-- CreateIndex
CREATE INDEX "Result_occurrenceId_finishTimeSeconds_idx" ON "Result"("occurrenceId", "finishTimeSeconds");

-- CreateIndex
CREATE INDEX "Result_athleteKey_idx" ON "Result"("athleteKey");

-- CreateIndex
CREATE UNIQUE INDEX "Result_occurrenceId_position_key" ON "Result"("occurrenceId", "position");

-- CreateIndex
CREATE INDEX "UserEvent_eventId_idx" ON "UserEvent"("eventId");

-- CreateIndex
CREATE INDEX "EventScore_calculationVersion_idx" ON "EventScore"("calculationVersion");

-- CreateIndex
CREATE UNIQUE INDEX "EventScore_eventId_calculationVersion_key" ON "EventScore"("eventId", "calculationVersion");

-- AddForeignKey
ALTER TABLE "EventOccurrence" ADD CONSTRAINT "EventOccurrence_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Result" ADD CONSTRAINT "Result_occurrenceId_fkey" FOREIGN KEY ("occurrenceId") REFERENCES "EventOccurrence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserEvent" ADD CONSTRAINT "UserEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserEvent" ADD CONSTRAINT "UserEvent_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventScore" ADD CONSTRAINT "EventScore_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
