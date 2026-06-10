-- AlterTable DiscoverySeedSource
ALTER TABLE "DiscoverySeedSource" ADD COLUMN IF NOT EXISTS "priority" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "DiscoverySeedSource" ADD COLUMN IF NOT EXISTS "batchLimit" INTEGER;
ALTER TABLE "DiscoverySeedSource" ADD COLUMN IF NOT EXISTS "lastError" TEXT;
ALTER TABLE "DiscoverySeedSource" ADD COLUMN IF NOT EXISTS "errorCount" INTEGER NOT NULL DEFAULT 0;

-- AlterTable DiscoveryBatchRun
ALTER TABLE "DiscoveryBatchRun" ADD COLUMN IF NOT EXISTS "triggeredBy" TEXT;
ALTER TABLE "DiscoveryBatchRun" ADD COLUMN IF NOT EXISTS "triggeredById" TEXT;
ALTER TABLE "DiscoveryBatchRun" ADD COLUMN IF NOT EXISTS "configSnapshot" TEXT;

-- CreateTable
CREATE TABLE IF NOT EXISTS "discovery_config" (
    "id" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "cronExpression" TEXT NOT NULL DEFAULT '0 */6 * * *',
    "batchSize" INTEGER NOT NULL DEFAULT 20,
    "concurrency" INTEGER NOT NULL DEFAULT 3,
    "delayMs" INTEGER NOT NULL DEFAULT 2000,
    "maxRunsPerDay" INTEGER NOT NULL DEFAULT 4,
    "pausedUntil" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "discovery_config_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "DiscoverySeedSource_priority_idx" ON "DiscoverySeedSource"("priority");
