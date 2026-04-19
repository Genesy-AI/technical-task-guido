-- AlterTable
ALTER TABLE "lead" ADD COLUMN "phoneEnrichmentProvider" TEXT;
ALTER TABLE "lead" ADD COLUMN "phoneEnrichmentStatus" TEXT;
ALTER TABLE "lead" ADD COLUMN "phoneEnrichmentUpdatedAt" DATETIME;
ALTER TABLE "lead" ADD COLUMN "phoneNumber" TEXT;
