/*
  Warnings:

  - You are about to drop the `DeviceEvent` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `DeviceStatusSnapshot` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `MIEvent` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `MIObject` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `MiGenerationJob` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `PromoDeployment` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `PromoInstance` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `PromoRegistration` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `PromoTracking` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `StoreDraftCommit` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the column `generationStatus` on the `Business` table. All the data in the column will be lost.
  - You are about to drop the column `lastGeneratedAt` on the `Business` table. All the data in the column will be lost.
  - You are about to drop the column `profileAvatarUrl` on the `Business` table. All the data in the column will be lost.
  - You are about to drop the column `profileCompletedAt` on the `Business` table. All the data in the column will be lost.
  - You are about to drop the column `profileHeroUrl` on the `Business` table. All the data in the column will be lost.
  - You are about to drop the column `profileHeroVideoUrl` on the `Business` table. All the data in the column will be lost.
  - You are about to drop the column `height` on the `LibraryAsset` table. All the data in the column will be lost.
  - You are about to drop the column `storeId` on the `LibraryAsset` table. All the data in the column will be lost.
  - You are about to drop the column `tenantId` on the `LibraryAsset` table. All the data in the column will be lost.
  - You are about to drop the column `width` on the `LibraryAsset` table. All the data in the column will be lost.
  - You are about to drop the column `count` on the `MenuImageMemory` table. All the data in the column will be lost.
  - You are about to drop the column `selectedAssetId` on the `MenuImageMemory` table. All the data in the column will be lost.
  - You are about to drop the column `selectedUrl` on the `MenuImageMemory` table. All the data in the column will be lost.
  - You are about to drop the column `productId` on the `MenuItemImageMatch` table. All the data in the column will be lost.
  - You are about to drop the column `selectedAssetId` on the `MenuItemImageMatch` table. All the data in the column will be lost.
  - You are about to drop the column `tags` on the `Product` table. All the data in the column will be lost.
  - Added the required column `menuItemId` to the `MenuItemImageMatch` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX IF EXISTS "

DeviceEvent_type_createdAt_idx";

-- DropIndex
DROP INDEX IF EXISTS "

DeviceEvent_sessionId_createdAt_idx";

-- DropIndex
DROP INDEX IF EXISTS "

DeviceEvent_deviceId_createdAt_idx";

-- DropIndex
DROP INDEX IF EXISTS "

DeviceEvent_tenantId_storeId_createdAt_idx";

-- DropIndex
DROP INDEX IF EXISTS "

DeviceStatusSnapshot_deviceId_idx";

-- DropIndex
DROP INDEX IF EXISTS "

DeviceStatusSnapshot_tenantId_storeId_idx";

-- DropIndex
DROP INDEX IF EXISTS "

DeviceStatusSnapshot_deviceId_key";

-- DropIndex
DROP INDEX IF EXISTS "

MIEvent_objectId_kind_idx";

-- DropIndex
DROP INDEX IF EXISTS "

MIEvent_timestamp_idx";

-- DropIndex
DROP INDEX IF EXISTS "

MIEvent_kind_idx";

-- DropIndex
DROP INDEX IF EXISTS "

MIEvent_objectId_idx";

-- DropIndex
DROP INDEX IF EXISTS "

MIObject_ownerTenantId_ownerStoreId_idx";

-- DropIndex
DROP INDEX IF EXISTS "

MIObject_ownerStoreId_idx";

-- DropIndex
DROP INDEX IF EXISTS "

MIObject_ownerTenantId_idx";

-- DropIndex
DROP INDEX IF EXISTS "

MIObject_kind_idx";

-- DropIndex
DROP INDEX IF EXISTS "

MiGenerationJob_createdAt_idx";

-- DropIndex
DROP INDEX IF EXISTS "

MiGenerationJob_sourceType_idx";

-- DropIndex
DROP INDEX IF EXISTS "

MiGenerationJob_status_idx";

-- DropIndex
DROP INDEX IF EXISTS "

MiGenerationJob_storeId_idx";

-- DropIndex
DROP INDEX IF EXISTS "

MiGenerationJob_tenantId_idx";

-- DropIndex
DROP INDEX IF EXISTS "

PromoDeployment_tenantId_storeId_idx";

-- DropIndex
DROP INDEX IF EXISTS "

PromoDeployment_storeId_idx";

-- DropIndex
DROP INDEX IF EXISTS "

PromoDeployment_tenantId_idx";

-- DropIndex
DROP INDEX IF EXISTS "

PromoDeployment_publicId_idx";

-- DropIndex
DROP INDEX IF EXISTS "

PromoDeployment_instanceId_idx";

-- DropIndex
DROP INDEX IF EXISTS "

PromoDeployment_publicId_key";

-- DropIndex
DROP INDEX IF EXISTS "

PromoInstance_tenantId_storeId_idx";

-- DropIndex
DROP INDEX IF EXISTS "

PromoInstance_status_idx";

-- DropIndex
DROP INDEX IF EXISTS "

PromoInstance_draftId_idx";

-- DropIndex
DROP INDEX IF EXISTS "

PromoInstance_storeId_idx";

-- DropIndex
DROP INDEX IF EXISTS "

PromoInstance_tenantId_idx";

-- DropIndex
DROP INDEX IF EXISTS "

PromoRegistration_instanceId_phone_idx";

-- DropIndex
DROP INDEX IF EXISTS "

PromoRegistration_instanceId_email_idx";

-- DropIndex
DROP INDEX IF EXISTS "

PromoRegistration_phone_idx";

-- DropIndex
DROP INDEX IF EXISTS "

PromoRegistration_email_idx";

-- DropIndex
DROP INDEX IF EXISTS "

PromoRegistration_publicId_idx";

-- DropIndex
DROP INDEX IF EXISTS "

PromoRegistration_instanceId_idx";

-- DropIndex
DROP INDEX IF EXISTS "

PromoTracking_instanceId_event_idx";

-- DropIndex
DROP INDEX IF EXISTS "

PromoTracking_timestamp_idx";

-- DropIndex
DROP INDEX IF EXISTS "

PromoTracking_event_idx";

-- DropIndex
DROP INDEX IF EXISTS "

PromoTracking_instanceId_idx";

-- DropIndex
DROP INDEX IF EXISTS "

StoreDraftCommit_tenantId_userId_idempotencyKey_key";

-- DropIndex
DROP INDEX IF EXISTS "

StoreDraftCommit_createdAt_idx";

-- DropIndex
DROP INDEX IF EXISTS "

StoreDraftCommit_idempotencyKey_idx";

-- DropIndex
DROP INDEX IF EXISTS "

StoreDraftCommit_storeId_idx";

-- DropIndex
DROP INDEX IF EXISTS "

StoreDraftCommit_jobId_idx";

-- DropIndex
DROP INDEX IF EXISTS "

StoreDraftCommit_userId_idx";

-- DropIndex
DROP INDEX IF EXISTS "

StoreDraftCommit_tenantId_idx";

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE IF EXISTS "DeviceEvent";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE IF EXISTS "DeviceStatusSnapshot";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE IF EXISTS "MIEvent";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE IF EXISTS "MIObject";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE IF EXISTS "MiGenerationJob";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE IF EXISTS "PromoDeployment";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE IF EXISTS "PromoInstance";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE IF EXISTS "PromoRegistration";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE IF EXISTS "PromoTracking";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE IF EXISTS "StoreDraftCommit";
PRAGMA foreign_keys=on;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Business" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "translations" JSONB,
    "logo" TEXT,
    "region" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "tradingHours" JSONB,
    "address" TEXT,
    "suburb" TEXT,
    "postcode" TEXT,
    "country" TEXT,
    "phone" TEXT,
    "lat" REAL,
    "lng" REAL,
    "primaryColor" TEXT,
    "secondaryColor" TEXT,
    "tagline" TEXT,
    "heroText" TEXT,
    "stylePreferences" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Business_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Business" ("address", "country", "createdAt", "description", "heroText", "id", "isActive", "lat", "lng", "logo", "name", "phone", "postcode", "primaryColor", "region", "secondaryColor", "slug", "stylePreferences", "suburb", "tagline", "tradingHours", "translations", "type", "updatedAt", "userId") SELECT "address", "country", "createdAt", "description", "heroText", "id", "isActive", "lat", "lng", "logo", "name", "phone", "postcode", "primaryColor", "region", "secondaryColor", "slug", "stylePreferences", "suburb", "tagline", "tradingHours", "translations", "type", "updatedAt", "userId" FROM "Business";
DROP TABLE IF EXISTS "Business";
ALTER TABLE "new_Business" RENAME TO "Business";
CREATE UNIQUE INDEX "Business_userId_key" ON "Business"("userId");
CREATE UNIQUE INDEX "Business_slug_key" ON "Business"("slug");
CREATE INDEX "Business_slug_idx" ON "Business"("slug");
CREATE TABLE "new_LibraryAsset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "url" TEXT NOT NULL,
    "mimeType" TEXT,
    "category" TEXT,
    "tags" JSONB,
    "locale" TEXT,
    "source" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_LibraryAsset" ("category", "createdAt", "id", "locale", "mimeType", "source", "tags", "updatedAt", "url") SELECT "category", "createdAt", "id", "locale", "mimeType", "source", "tags", "updatedAt", "url" FROM "LibraryAsset";
DROP TABLE IF EXISTS "LibraryAsset";
ALTER TABLE "new_LibraryAsset" RENAME TO "LibraryAsset";
CREATE INDEX "LibraryAsset_category_idx" ON "LibraryAsset"("category");
CREATE INDEX "LibraryAsset_source_idx" ON "LibraryAsset"("source");
CREATE INDEX "LibraryAsset_url_idx" ON "LibraryAsset"("url");
CREATE TABLE "new_LibraryEmbedding" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "assetId" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "dims" INTEGER NOT NULL,
    "vector" JSONB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "LibraryEmbedding_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "LibraryAsset" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_LibraryEmbedding" ("assetId", "createdAt", "dims", "id", "model", "updatedAt", "vector") SELECT "assetId", "createdAt", "dims", "id", "model", "updatedAt", "vector" FROM "LibraryEmbedding";
DROP TABLE IF EXISTS "LibraryEmbedding";
ALTER TABLE "new_LibraryEmbedding" RENAME TO "LibraryEmbedding";
CREATE UNIQUE INDEX "LibraryEmbedding_assetId_key" ON "LibraryEmbedding"("assetId");
CREATE INDEX "LibraryEmbedding_assetId_idx" ON "LibraryEmbedding"("assetId");
CREATE TABLE "new_MenuImageMemory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "storeId" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "url" TEXT,
    "category" TEXT,
    "tags" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_MenuImageMemory" ("createdAt", "id", "normalizedName", "storeId", "updatedAt") SELECT "createdAt", "id", "normalizedName", "storeId", "updatedAt" FROM "MenuImageMemory";
DROP TABLE IF EXISTS "MenuImageMemory";
ALTER TABLE "new_MenuImageMemory" RENAME TO "MenuImageMemory";
CREATE INDEX "MenuImageMemory_storeId_idx" ON "MenuImageMemory"("storeId");
CREATE INDEX "MenuImageMemory_normalizedName_idx" ON "MenuImageMemory"("normalizedName");
CREATE UNIQUE INDEX "MenuImageMemory_storeId_normalizedName_key" ON "MenuImageMemory"("storeId", "normalizedName");
CREATE TABLE "new_MenuItemImageMatch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "menuItemId" TEXT NOT NULL,
    "selectedUrl" TEXT,
    "confidence" REAL,
    "status" TEXT,
    "candidates" JSONB,
    "queryNorm" TEXT,
    "matchVersion" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_MenuItemImageMatch" ("candidates", "confidence", "createdAt", "id", "matchVersion", "queryNorm", "selectedUrl", "status", "updatedAt") SELECT "candidates", "confidence", "createdAt", "id", "matchVersion", "queryNorm", "selectedUrl", "status", "updatedAt" FROM "MenuItemImageMatch";
DROP TABLE IF EXISTS "MenuItemImageMatch";
ALTER TABLE "new_MenuItemImageMatch" RENAME TO "MenuItemImageMatch";
CREATE UNIQUE INDEX "MenuItemImageMatch_menuItemId_key" ON "MenuItemImageMatch"("menuItemId");
CREATE INDEX "MenuItemImageMatch_menuItemId_idx" ON "MenuItemImageMatch"("menuItemId");
CREATE INDEX "MenuItemImageMatch_status_idx" ON "MenuItemImageMatch"("status");
CREATE TABLE "new_Product" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT,
    "description" TEXT,
    "translations" JSONB,
    "price" REAL,
    "currency" TEXT DEFAULT 'USD',
    "category" TEXT,
    "imageUrl" TEXT,
    "sku" TEXT,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "images" JSONB,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "likeCount" INTEGER NOT NULL DEFAULT 0,
    "hasSam3Cutout" BOOLEAN NOT NULL DEFAULT false,
    "cutoutPath" TEXT,
    "deletedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Product_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Product" ("businessId", "category", "createdAt", "currency", "cutoutPath", "deletedAt", "description", "hasSam3Cutout", "id", "imageUrl", "images", "isPublished", "likeCount", "name", "normalizedName", "price", "sku", "translations", "updatedAt", "viewCount") SELECT "businessId", "category", "createdAt", "currency", "cutoutPath", "deletedAt", "description", "hasSam3Cutout", "id", "imageUrl", "images", "isPublished", "likeCount", "name", "normalizedName", "price", "sku", "translations", "updatedAt", "viewCount" FROM "Product";
DROP TABLE IF EXISTS "Product";
ALTER TABLE "new_Product" RENAME TO "Product";
CREATE INDEX "Product_businessId_idx" ON "Product"("businessId");
CREATE INDEX "Product_businessId_isPublished_idx" ON "Product"("businessId", "isPublished");
CREATE INDEX "Product_category_idx" ON "Product"("category");
CREATE INDEX "Product_deletedAt_idx" ON "Product"("deletedAt");
CREATE INDEX "Product_hasSam3Cutout_idx" ON "Product"("hasSam3Cutout");
CREATE UNIQUE INDEX "Product_businessId_normalizedName_key" ON "Product"("businessId", "normalizedName");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
