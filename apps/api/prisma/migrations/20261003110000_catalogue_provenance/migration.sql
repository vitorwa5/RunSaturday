-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "catalogueImportRunId" TEXT,
ADD COLUMN     "countryCode" TEXT,
ADD COLUMN     "externalId" TEXT,
ADD COLUMN     "importedAt" TIMESTAMP(3),
ADD COLUMN     "sourceAttribution" TEXT,
ADD COLUMN     "sourceLicence" TEXT,
ADD COLUMN     "sourceNamespace" TEXT,
ADD COLUMN     "sourceUpdatedAt" TIMESTAMP(3),
ADD COLUMN     "sourceUrl" TEXT,
ADD COLUMN     "subdivisionCode" TEXT,
ADD COLUMN     "timezone" TEXT;

-- AlterTable
ALTER TABLE "RunnerFormSnapshot" ADD COLUMN     "evidenceScope" TEXT;

-- CreateTable
CREATE TABLE "CatalogueImportRun" (
    "id" TEXT NOT NULL,
    "sourceNamespace" TEXT NOT NULL,
    "source" "DataSource" NOT NULL,
    "sourceAttribution" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "sourceLicence" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "received" INTEGER NOT NULL,
    "created" INTEGER NOT NULL DEFAULT 0,
    "updated" INTEGER NOT NULL DEFAULT 0,
    "unchanged" INTEGER NOT NULL DEFAULT 0,
    "deactivated" INTEGER NOT NULL DEFAULT 0,
    "rejected" INTEGER NOT NULL DEFAULT 0,
    "rejections" JSONB NOT NULL,

    CONSTRAINT "CatalogueImportRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CatalogueImportRun_sourceNamespace_startedAt_idx" ON "CatalogueImportRun"("sourceNamespace", "startedAt");

-- CreateIndex
CREATE INDEX "Event_source_active_countryCode_region_idx" ON "Event"("source", "active", "countryCode", "region");

-- CreateIndex
CREATE UNIQUE INDEX "Event_sourceNamespace_externalId_key" ON "Event"("sourceNamespace", "externalId");

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_catalogueImportRunId_fkey" FOREIGN KEY ("catalogueImportRunId") REFERENCES "CatalogueImportRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Legacy rows retain unknown provenance. New identities must be complete, never half-mapped.
ALTER TABLE "Event" ADD CONSTRAINT "Event_catalogue_identity_complete" CHECK (
  ("sourceNamespace" IS NULL AND "externalId" IS NULL) OR
  ("sourceNamespace" IS NOT NULL AND length("sourceNamespace") > 0
   AND "externalId" IS NOT NULL AND length("externalId") > 0
   AND "countryCode" ~ '^[A-Z]{2}$' AND "countryCode" IS NOT NULL
   AND "timezone" IS NOT NULL AND "importedAt" IS NOT NULL
   AND "catalogueImportRunId" IS NOT NULL)
);
