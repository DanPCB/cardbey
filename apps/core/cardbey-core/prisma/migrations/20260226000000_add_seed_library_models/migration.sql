-- Legal Seed Library: SeedIngestionJob, SeedAsset, SeedAssetFile
-- Does not modify DraftStore, Business, Product, or any table used in Draft → Preview → Publish.

-- CreateTable (job first; SeedAsset references it optionally)
CREATE TABLE "SeedIngestionJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "provider" TEXT,
    "status" TEXT NOT NULL DEFAULT 'running',
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    "meta" TEXT,
    "errorMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "SeedAsset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "provider" TEXT NOT NULL,
    "providerAssetId" TEXT NOT NULL,
    "sourcePageUrl" TEXT,
    "photographerName" TEXT,
    "photographerUrl" TEXT,
    "licenseName" TEXT,
    "licenseUrl" TEXT,
    "attributionText" TEXT,
    "width" INTEGER,
    "height" INTEGER,
    "orientation" TEXT,
    "tags" TEXT,
    "vertical" TEXT,
    "categoryKey" TEXT,
    "sha256" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "ingestionJobId" TEXT,
    CONSTRAINT "SeedAsset_ingestionJobId_fkey" FOREIGN KEY ("ingestionJobId") REFERENCES "SeedIngestionJob" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SeedAssetFile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "seedAssetId" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'full',
    "width" INTEGER,
    "height" INTEGER,
    "mimeType" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SeedAssetFile_seedAssetId_fkey" FOREIGN KEY ("seedAssetId") REFERENCES "SeedAsset" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "SeedAsset_provider_providerAssetId_key" ON "SeedAsset"("provider", "providerAssetId");

-- CreateIndex (SQLite allows multiple NULLs in unique column)
CREATE UNIQUE INDEX "SeedAsset_sha256_key" ON "SeedAsset"("sha256");

-- CreateIndex
CREATE INDEX "SeedAsset_provider_idx" ON "SeedAsset"("provider");
CREATE INDEX "SeedAsset_vertical_idx" ON "SeedAsset"("vertical");
CREATE INDEX "SeedAsset_categoryKey_idx" ON "SeedAsset"("categoryKey");
CREATE INDEX "SeedAsset_status_idx" ON "SeedAsset"("status");
CREATE INDEX "SeedAsset_ingestionJobId_idx" ON "SeedAsset"("ingestionJobId");

-- CreateIndex
CREATE INDEX "SeedAssetFile_seedAssetId_idx" ON "SeedAssetFile"("seedAssetId");
CREATE INDEX "SeedAssetFile_role_idx" ON "SeedAssetFile"("role");

-- CreateIndex
CREATE INDEX "SeedIngestionJob_provider_idx" ON "SeedIngestionJob"("provider");
CREATE INDEX "SeedIngestionJob_status_idx" ON "SeedIngestionJob"("status");
CREATE INDEX "SeedIngestionJob_startedAt_idx" ON "SeedIngestionJob"("startedAt");
