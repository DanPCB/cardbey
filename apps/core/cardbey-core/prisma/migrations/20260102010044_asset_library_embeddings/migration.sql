-- AlterTable
ALTER TABLE "Business" ADD COLUMN "profileAvatarUrl" TEXT;
ALTER TABLE "Business" ADD COLUMN "profileCompletedAt" DATETIME;
ALTER TABLE "Business" ADD COLUMN "profileHeroUrl" TEXT;
ALTER TABLE "Business" ADD COLUMN "profileHeroVideoUrl" TEXT;

-- CreateTable
CREATE TABLE "LibraryAsset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "url" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL DEFAULT 'image/jpeg',
    "width" INTEGER,
    "height" INTEGER,
    "tags" JSONB NOT NULL DEFAULT [],
    "category" TEXT,
    "locale" TEXT NOT NULL DEFAULT 'en',
    "source" TEXT NOT NULL DEFAULT 'seed',
    "tenantId" TEXT,
    "storeId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "LibraryEmbedding" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "assetId" TEXT NOT NULL,
    "model" TEXT NOT NULL DEFAULT 'text-embedding-3-small',
    "dims" INTEGER NOT NULL DEFAULT 1536,
    "vector" JSONB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "LibraryEmbedding_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "LibraryAsset" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MenuItemImageMatch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productId" TEXT NOT NULL,
    "selectedAssetId" TEXT,
    "selectedUrl" TEXT,
    "confidence" REAL,
    "status" TEXT NOT NULL DEFAULT 'needs_review',
    "matchVersion" TEXT NOT NULL DEFAULT 'v1',
    "queryNorm" TEXT,
    "candidates" JSONB NOT NULL DEFAULT [],
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MenuItemImageMatch_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MenuItemImageMatch_selectedAssetId_fkey" FOREIGN KEY ("selectedAssetId") REFERENCES "LibraryAsset" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MenuImageMemory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "storeId" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "selectedAssetId" TEXT,
    "selectedUrl" TEXT,
    "count" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "LibraryAsset_category_idx" ON "LibraryAsset"("category");

-- CreateIndex
CREATE INDEX "LibraryAsset_locale_idx" ON "LibraryAsset"("locale");

-- CreateIndex
CREATE INDEX "LibraryAsset_source_idx" ON "LibraryAsset"("source");

-- CreateIndex
CREATE INDEX "LibraryAsset_tenantId_storeId_idx" ON "LibraryAsset"("tenantId", "storeId");

-- CreateIndex
CREATE INDEX "LibraryAsset_url_idx" ON "LibraryAsset"("url");

-- CreateIndex
CREATE UNIQUE INDEX "LibraryEmbedding_assetId_key" ON "LibraryEmbedding"("assetId");

-- CreateIndex
CREATE INDEX "LibraryEmbedding_assetId_idx" ON "LibraryEmbedding"("assetId");

-- CreateIndex
CREATE UNIQUE INDEX "MenuItemImageMatch_productId_key" ON "MenuItemImageMatch"("productId");

-- CreateIndex
CREATE INDEX "MenuItemImageMatch_productId_idx" ON "MenuItemImageMatch"("productId");

-- CreateIndex
CREATE INDEX "MenuItemImageMatch_status_idx" ON "MenuItemImageMatch"("status");

-- CreateIndex
CREATE INDEX "MenuItemImageMatch_selectedAssetId_idx" ON "MenuItemImageMatch"("selectedAssetId");

-- CreateIndex
CREATE INDEX "MenuImageMemory_storeId_idx" ON "MenuImageMemory"("storeId");

-- CreateIndex
CREATE INDEX "MenuImageMemory_normalizedName_idx" ON "MenuImageMemory"("normalizedName");

-- CreateIndex
CREATE UNIQUE INDEX "MenuImageMemory_storeId_normalizedName_key" ON "MenuImageMemory"("storeId", "normalizedName");
