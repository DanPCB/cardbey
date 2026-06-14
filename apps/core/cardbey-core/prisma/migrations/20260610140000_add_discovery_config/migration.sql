-- AlterTable DiscoverySeedSource
ALTER TABLE "DiscoverySeedSource" ADD COLUMN "priority" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "DiscoverySeedSource" ADD COLUMN "batchLimit" INTEGER;
ALTER TABLE "DiscoverySeedSource" ADD COLUMN "lastError" TEXT;
ALTER TABLE "DiscoverySeedSource" ADD COLUMN "errorCount" INTEGER NOT NULL DEFAULT 0;

-- AlterTable DiscoveryBatchRun
ALTER TABLE "DiscoveryBatchRun" ADD COLUMN "triggeredBy" TEXT;
ALTER TABLE "DiscoveryBatchRun" ADD COLUMN "triggeredById" TEXT;
ALTER TABLE "DiscoveryBatchRun" ADD COLUMN "configSnapshot" TEXT;

-- CreateTable
CREATE TABLE IF NOT EXISTS "discovery_config" (
    "id" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "cronExpression" TEXT NOT NULL DEFAULT '0 */6 * * *',
    "batchSize" INTEGER NOT NULL DEFAULT 20,
    "concurrency" INTEGER NOT NULL DEFAULT 3,
    "delayMs" INTEGER NOT NULL DEFAULT 2000,
    "maxRunsPerDay" INTEGER NOT NULL DEFAULT 4,
    "pausedUntil" DATETIME,
    "updatedAt" DATETIME NOT NULL,
    "updatedBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "discovery_config_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "DiscoverySeedSource_priority_idx" ON "DiscoverySeedSource"("priority");
