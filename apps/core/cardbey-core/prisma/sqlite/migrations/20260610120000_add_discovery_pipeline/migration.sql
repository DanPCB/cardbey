-- AlterTable
ALTER TABLE "DraftStore" ADD COLUMN "unclaimedStoreId" TEXT;
ALTER TABLE "DraftStore" ADD COLUMN "transferredAt" DATETIME;

-- CreateIndex
CREATE INDEX "DraftStore_unclaimedStoreId_idx" ON "DraftStore"("unclaimedStoreId");

-- CreateTable
CREATE TABLE "UnclaimedStore" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "businessName" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "bioText" TEXT,
    "avatarUrl" TEXT,
    "followerCount" INTEGER,
    "category" TEXT,
    "location" TEXT,
    "brandTone" TEXT,
    "brandStyle" TEXT,
    "socialLinks" TEXT,
    "rawVideos" TEXT,
    "importHashtags" TEXT,
    "discoveryBatch" TEXT,
    "claimAuthority" TEXT,
    "status" TEXT NOT NULL DEFAULT 'unclaimed',
    "claimedBy" TEXT,
    "claimedAt" DATETIME,
    "preBuiltStoreId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME
);

-- CreateTable
CREATE TABLE "DiscoverySeedSource" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "location" TEXT,
    "category" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastRunAt" DATETIME,
    "runCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "DiscoveryBatchRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'running',
    "seedSourceId" TEXT,
    "seedType" TEXT,
    "seedValue" TEXT,
    "discovered" INTEGER NOT NULL DEFAULT 0,
    "scraped" INTEGER NOT NULL DEFAULT 0,
    "created" INTEGER NOT NULL DEFAULT 0,
    "skipped" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "preBuilt" INTEGER NOT NULL DEFAULT 0,
    "errorLog" TEXT
);

-- CreateIndex
CREATE UNIQUE INDEX "UnclaimedStore_slug_key" ON "UnclaimedStore"("slug");
CREATE UNIQUE INDEX "UnclaimedStore_sourceUrl_key" ON "UnclaimedStore"("sourceUrl");
CREATE INDEX "UnclaimedStore_status_idx" ON "UnclaimedStore"("status");
CREATE INDEX "UnclaimedStore_platform_idx" ON "UnclaimedStore"("platform");
CREATE INDEX "UnclaimedStore_createdAt_idx" ON "UnclaimedStore"("createdAt");
CREATE INDEX "UnclaimedStore_discoveryBatch_idx" ON "UnclaimedStore"("discoveryBatch");
CREATE INDEX "DiscoverySeedSource_isActive_idx" ON "DiscoverySeedSource"("isActive");
CREATE INDEX "DiscoverySeedSource_type_idx" ON "DiscoverySeedSource"("type");
CREATE INDEX "DiscoveryBatchRun_status_idx" ON "DiscoveryBatchRun"("status");
CREATE INDEX "DiscoveryBatchRun_startedAt_idx" ON "DiscoveryBatchRun"("startedAt");
CREATE INDEX "DiscoveryBatchRun_seedSourceId_idx" ON "DiscoveryBatchRun"("seedSourceId");
