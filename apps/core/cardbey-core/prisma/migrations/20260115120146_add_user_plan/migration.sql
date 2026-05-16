/*
  Warnings:

  - You are about to drop the `LibraryAsset` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `LibraryEmbedding` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `MenuImageMemory` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `MenuItemImageMatch` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `MiArtifact` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `MiGenerationJob` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `MiStage` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `PromoDeployment` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `PromoInstance` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `PromoTracking` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `_QrLinkStatus` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `_QrScanSource` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `_QrTargetType` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the column `tags` on the `Product` table. All the data in the column will be lost.
  - You are about to alter the column `meta` on the `QrLink` table. The data in that column could be lost. The data in that column will be cast from `String` to `Json`.

*/
-- DropIndex
DROP INDEX "LibraryAsset_url_idx";

-- DropIndex
DROP INDEX "LibraryAsset_source_idx";

-- DropIndex
DROP INDEX "LibraryAsset_category_idx";

-- DropIndex
DROP INDEX "LibraryEmbedding_assetId_idx";

-- DropIndex
DROP INDEX "LibraryEmbedding_assetId_key";

-- DropIndex
DROP INDEX "MenuImageMemory_storeId_normalizedName_key";

-- DropIndex
DROP INDEX "MenuImageMemory_selectedAssetId_idx";

-- DropIndex
DROP INDEX "MenuImageMemory_normalizedName_idx";

-- DropIndex
DROP INDEX "MenuImageMemory_storeId_idx";

-- DropIndex
DROP INDEX "MenuItemImageMatch_status_idx";

-- DropIndex
DROP INDEX "MenuItemImageMatch_menuItemId_idx";

-- DropIndex
DROP INDEX "MenuItemImageMatch_menuItemId_key";

-- DropIndex
DROP INDEX "MiArtifact_createdAt_idx";

-- DropIndex
DROP INDEX "MiArtifact_type_idx";

-- DropIndex
DROP INDEX "MiArtifact_stageKey_idx";

-- DropIndex
DROP INDEX "MiArtifact_jobId_stageKey_idx";

-- DropIndex
DROP INDEX "MiArtifact_jobId_type_idx";

-- DropIndex
DROP INDEX "MiGenerationJob_createdAt_idx";

-- DropIndex
DROP INDEX "MiGenerationJob_sourceType_idx";

-- DropIndex
DROP INDEX "MiGenerationJob_status_idx";

-- DropIndex
DROP INDEX "MiGenerationJob_storeId_idx";

-- DropIndex
DROP INDEX "MiGenerationJob_tenantId_idx";

-- DropIndex
DROP INDEX "MiStage_jobId_stageKey_key";

-- DropIndex
DROP INDEX "MiStage_createdAt_idx";

-- DropIndex
DROP INDEX "MiStage_stageKey_idx";

-- DropIndex
DROP INDEX "MiStage_jobId_stageKey_idx";

-- DropIndex
DROP INDEX "MiStage_jobId_status_idx";

-- DropIndex
DROP INDEX "MiStage_jobId_idx";

-- DropIndex
DROP INDEX "PromoDeployment_storeId_idx";

-- DropIndex
DROP INDEX "PromoDeployment_tenantId_idx";

-- DropIndex
DROP INDEX "PromoDeployment_publicId_idx";

-- DropIndex
DROP INDEX "PromoDeployment_instanceId_idx";

-- DropIndex
DROP INDEX "PromoDeployment_publicId_key";

-- DropIndex
DROP INDEX "PromoInstance_targetType_targetId_idx";

-- DropIndex
DROP INDEX "PromoInstance_status_idx";

-- DropIndex
DROP INDEX "PromoInstance_draftId_idx";

-- DropIndex
DROP INDEX "PromoInstance_storeId_idx";

-- DropIndex
DROP INDEX "PromoInstance_tenantId_idx";

-- DropIndex
DROP INDEX "PromoTracking_instanceId_event_idx";

-- DropIndex
DROP INDEX "PromoTracking_timestamp_idx";

-- DropIndex
DROP INDEX "PromoTracking_event_idx";

-- DropIndex
DROP INDEX "PromoTracking_instanceId_idx";

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "LibraryAsset";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "LibraryEmbedding";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "MenuImageMemory";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "MenuItemImageMatch";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "MiArtifact";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "MiGenerationJob";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "MiStage";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "PromoDeployment";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "PromoInstance";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "PromoTracking";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "_QrLinkStatus";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "_QrScanSource";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "_QrTargetType";
PRAGMA foreign_keys=on;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
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
    "source" TEXT DEFAULT 'user',
    "generationRunId" TEXT,
    "deletedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Product_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Product" ("businessId", "category", "createdAt", "currency", "cutoutPath", "deletedAt", "description", "generationRunId", "hasSam3Cutout", "id", "imageUrl", "images", "isPublished", "likeCount", "name", "normalizedName", "price", "sku", "source", "translations", "updatedAt", "viewCount") SELECT "businessId", "category", "createdAt", "currency", "cutoutPath", "deletedAt", "description", "generationRunId", "hasSam3Cutout", "id", "imageUrl", "images", "isPublished", "likeCount", "name", "normalizedName", "price", "sku", "source", "translations", "updatedAt", "viewCount" FROM "Product";
DROP TABLE "Product";
ALTER TABLE "new_Product" RENAME TO "Product";
CREATE INDEX "Product_businessId_idx" ON "Product"("businessId");
CREATE INDEX "Product_businessId_isPublished_idx" ON "Product"("businessId", "isPublished");
CREATE INDEX "Product_category_idx" ON "Product"("category");
CREATE INDEX "Product_deletedAt_idx" ON "Product"("deletedAt");
CREATE INDEX "Product_hasSam3Cutout_idx" ON "Product"("hasSam3Cutout");
CREATE INDEX "Product_source_idx" ON "Product"("source");
CREATE INDEX "Product_generationRunId_idx" ON "Product"("generationRunId");
CREATE UNIQUE INDEX "Product_businessId_normalizedName_key" ON "Product"("businessId", "normalizedName");
CREATE TABLE "new_QrLink" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT,
    "targetUrl" TEXT,
    "promoId" TEXT,
    "storeId" TEXT,
    "tenantId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "meta" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_QrLink" ("code", "createdAt", "id", "meta", "promoId", "status", "storeId", "targetId", "targetType", "targetUrl", "tenantId", "updatedAt") SELECT "code", "createdAt", "id", "meta", "promoId", "status", "storeId", "targetId", "targetType", "targetUrl", "tenantId", "updatedAt" FROM "QrLink";
DROP TABLE "QrLink";
ALTER TABLE "new_QrLink" RENAME TO "QrLink";
CREATE UNIQUE INDEX "QrLink_code_key" ON "QrLink"("code");
CREATE INDEX "QrLink_storeId_targetType_idx" ON "QrLink"("storeId", "targetType");
CREATE INDEX "QrLink_tenantId_idx" ON "QrLink"("tenantId");
CREATE INDEX "QrLink_status_idx" ON "QrLink"("status");
CREATE INDEX "QrLink_promoId_idx" ON "QrLink"("promoId");
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "displayName" TEXT,
    "fullName" TEXT,
    "handle" TEXT,
    "avatarUrl" TEXT,
    "accountType" TEXT,
    "tagline" TEXT,
    "hasBusiness" BOOLEAN NOT NULL DEFAULT false,
    "onboarding" TEXT,
    "roles" TEXT NOT NULL DEFAULT '["viewer"]',
    "role" TEXT NOT NULL DEFAULT 'owner',
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "verificationToken" TEXT,
    "verificationExpires" DATETIME,
    "resetToken" TEXT,
    "resetExpires" DATETIME,
    "plan" TEXT NOT NULL DEFAULT 'free',
    "otpCode" TEXT,
    "otpExpires" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_User" ("accountType", "avatarUrl", "createdAt", "displayName", "email", "emailVerified", "fullName", "handle", "hasBusiness", "id", "onboarding", "passwordHash", "resetExpires", "resetToken", "role", "roles", "tagline", "updatedAt", "verificationExpires", "verificationToken") SELECT "accountType", "avatarUrl", "createdAt", "displayName", "email", "emailVerified", "fullName", "handle", "hasBusiness", "id", "onboarding", "passwordHash", "resetExpires", "resetToken", "role", "roles", "tagline", "updatedAt", "verificationExpires", "verificationToken" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "User_handle_key" ON "User"("handle");
CREATE INDEX "User_email_idx" ON "User"("email");
CREATE INDEX "User_handle_idx" ON "User"("handle");
CREATE INDEX "User_verificationToken_idx" ON "User"("verificationToken");
CREATE INDEX "User_resetToken_idx" ON "User"("resetToken");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
