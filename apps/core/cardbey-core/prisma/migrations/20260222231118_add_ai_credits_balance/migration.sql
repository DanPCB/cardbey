/*
  Warnings:

  - You are about to drop the `BusinessType` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `CatalogCategory` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `CatalogItem` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Region` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `StarterPack` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `StarterPackCategory` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `StarterPackItem` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ValidatorRule` table. If the table is not empty, all the data it contains will be lost.
  - You are about to alter the column `metadata` on the `AuditEvent` table. The data in that column could be lost. The data in that column will be cast from `String` to `Json`.
  - You are about to drop the column `groupMode` on the `Business` table. All the data in the column will be lost.
  - You are about to alter the column `meta` on the `ContentIngestSample` table. The data in that column could be lost. The data in that column will be cast from `String` to `Json`.
  - You are about to alter the column `outputCatalog` on the `ContentIngestSample` table. The data in that column could be lost. The data in that column will be cast from `String` to `Json`.

*/
-- DropIndex
DROP INDEX "BusinessType_key_key";

-- DropIndex
DROP INDEX "CatalogCategory_key_idx";

-- DropIndex
DROP INDEX "CatalogCategory_parentId_idx";

-- DropIndex
DROP INDEX "CatalogItem_defaultCategoryKey_idx";

-- DropIndex
DROP INDEX "CatalogItem_defaultCategoryId_idx";

-- DropIndex
DROP INDEX "CatalogItem_type_idx";

-- DropIndex
DROP INDEX "Region_code_key";

-- DropIndex
DROP INDEX "StarterPack_status_idx";

-- DropIndex
DROP INDEX "StarterPack_regionId_idx";

-- DropIndex
DROP INDEX "StarterPack_businessTypeId_idx";

-- DropIndex
DROP INDEX "StarterPackCategory_starterPackId_catalogCategoryId_key";

-- DropIndex
DROP INDEX "StarterPackCategory_catalogCategoryId_idx";

-- DropIndex
DROP INDEX "StarterPackCategory_starterPackId_idx";

-- DropIndex
DROP INDEX "StarterPackItem_starterPackId_catalogItemId_key";

-- DropIndex
DROP INDEX "StarterPackItem_catalogItemId_idx";

-- DropIndex
DROP INDEX "StarterPackItem_starterPackId_idx";

-- DropIndex
DROP INDEX "ValidatorRule_isEnabled_idx";

-- DropIndex
DROP INDEX "ValidatorRule_appliesToType_idx";

-- DropIndex
DROP INDEX "ValidatorRule_scope_idx";

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "BusinessType";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "CatalogCategory";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "CatalogItem";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "Region";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "StarterPack";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "StarterPackCategory";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "StarterPackItem";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "ValidatorRule";
PRAGMA foreign_keys=on;

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "usedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SeedCatalog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "verticalSlug" TEXT NOT NULL,
    "subIntent" TEXT NOT NULL DEFAULT '',
    "itemsJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "DynamicQr" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB,
    "targetPath" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ScanEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "dynamicQrId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "scannedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userAgent" TEXT,
    "referer" TEXT,
    CONSTRAINT "ScanEvent_dynamicQrId_fkey" FOREIGN KEY ("dynamicQrId") REFERENCES "DynamicQr" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AuditEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT,
    "actorType" TEXT NOT NULL,
    "actorId" TEXT,
    "correlationId" TEXT,
    "reason" TEXT,
    "metadata" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_AuditEvent" ("action", "actorId", "actorType", "correlationId", "createdAt", "entityId", "entityType", "fromStatus", "id", "metadata", "reason", "toStatus") SELECT "action", "actorId", "actorType", "correlationId", "createdAt", "entityId", "entityType", "fromStatus", "id", "metadata", "reason", "toStatus" FROM "AuditEvent";
DROP TABLE "AuditEvent";
ALTER TABLE "new_AuditEvent" RENAME TO "AuditEvent";
CREATE INDEX "AuditEvent_entityType_entityId_createdAt_idx" ON "AuditEvent"("entityType", "entityId", "createdAt");
CREATE INDEX "AuditEvent_correlationId_idx" ON "AuditEvent"("correlationId");
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
    "heroImageUrl" TEXT,
    "avatarImageUrl" TEXT,
    "publishedAt" DATETIME,
    "stylePreferences" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Business_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Business" ("address", "avatarImageUrl", "country", "createdAt", "description", "heroImageUrl", "heroText", "id", "isActive", "lat", "lng", "logo", "name", "phone", "postcode", "primaryColor", "publishedAt", "region", "secondaryColor", "slug", "stylePreferences", "suburb", "tagline", "tradingHours", "translations", "type", "updatedAt", "userId") SELECT "address", "avatarImageUrl", "country", "createdAt", "description", "heroImageUrl", "heroText", "id", "isActive", "lat", "lng", "logo", "name", "phone", "postcode", "primaryColor", "publishedAt", "region", "secondaryColor", "slug", "stylePreferences", "suburb", "tagline", "tradingHours", "translations", "type", "updatedAt", "userId" FROM "Business";
DROP TABLE "Business";
ALTER TABLE "new_Business" RENAME TO "Business";
CREATE UNIQUE INDEX "Business_userId_key" ON "Business"("userId");
CREATE UNIQUE INDEX "Business_slug_key" ON "Business"("slug");
CREATE INDEX "Business_slug_idx" ON "Business"("slug");
CREATE TABLE "new_ContentIngestSample" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "generationRunId" TEXT,
    "jobId" TEXT,
    "draftId" TEXT,
    "sourceType" TEXT NOT NULL,
    "goal" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "includeImages" BOOLEAN NOT NULL DEFAULT true,
    "templateKey" TEXT,
    "websiteDomain" TEXT,
    "vertical" TEXT,
    "rawInputSanitized" TEXT,
    "ocrTextSanitized" TEXT,
    "outputCatalog" JSONB NOT NULL,
    "meta" JSONB
);
INSERT INTO "new_ContentIngestSample" ("createdAt", "draftId", "generationRunId", "goal", "id", "includeImages", "jobId", "meta", "mode", "ocrTextSanitized", "outputCatalog", "rawInputSanitized", "sourceType", "templateKey", "vertical", "websiteDomain") SELECT "createdAt", "draftId", "generationRunId", "goal", "id", "includeImages", "jobId", "meta", "mode", "ocrTextSanitized", "outputCatalog", "rawInputSanitized", "sourceType", "templateKey", "vertical", "websiteDomain" FROM "ContentIngestSample";
DROP TABLE "ContentIngestSample";
ALTER TABLE "new_ContentIngestSample" RENAME TO "ContentIngestSample";
CREATE INDEX "ContentIngestSample_createdAt_idx" ON "ContentIngestSample"("createdAt");
CREATE INDEX "ContentIngestSample_sourceType_idx" ON "ContentIngestSample"("sourceType");
CREATE INDEX "ContentIngestSample_goal_idx" ON "ContentIngestSample"("goal");
CREATE INDEX "ContentIngestSample_draftId_idx" ON "ContentIngestSample"("draftId");
CREATE TABLE "new_DraftStore" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "mode" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "generationRunId" TEXT,
    "input" JSONB NOT NULL,
    "preview" JSONB,
    "error" TEXT,
    "errorCode" TEXT,
    "recommendedAction" TEXT,
    "committedAt" DATETIME,
    "committedStoreId" TEXT,
    "committedUserId" TEXT,
    "ownerUserId" TEXT,
    "guestSessionId" TEXT,
    "ipHash" TEXT,
    "userAgent" TEXT,
    CONSTRAINT "DraftStore_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_DraftStore" ("committedAt", "committedStoreId", "committedUserId", "createdAt", "error", "errorCode", "expiresAt", "generationRunId", "guestSessionId", "id", "input", "ipHash", "mode", "ownerUserId", "preview", "recommendedAction", "status", "updatedAt", "userAgent") SELECT "committedAt", "committedStoreId", "committedUserId", "createdAt", "error", "errorCode", "expiresAt", "generationRunId", "guestSessionId", "id", "input", "ipHash", "mode", "ownerUserId", "preview", "recommendedAction", "status", "updatedAt", "userAgent" FROM "DraftStore";
DROP TABLE "DraftStore";
ALTER TABLE "new_DraftStore" RENAME TO "DraftStore";
CREATE UNIQUE INDEX "DraftStore_generationRunId_key" ON "DraftStore"("generationRunId");
CREATE INDEX "DraftStore_expiresAt_idx" ON "DraftStore"("expiresAt");
CREATE INDEX "DraftStore_status_idx" ON "DraftStore"("status");
CREATE INDEX "DraftStore_createdAt_idx" ON "DraftStore"("createdAt");
CREATE INDEX "DraftStore_committedStoreId_idx" ON "DraftStore"("committedStoreId");
CREATE INDEX "DraftStore_committedUserId_idx" ON "DraftStore"("committedUserId");
CREATE INDEX "DraftStore_ownerUserId_idx" ON "DraftStore"("ownerUserId");
CREATE INDEX "DraftStore_guestSessionId_idx" ON "DraftStore"("guestSessionId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "PasswordResetToken_userId_idx" ON "PasswordResetToken"("userId");

-- CreateIndex
CREATE INDEX "PasswordResetToken_tokenHash_idx" ON "PasswordResetToken"("tokenHash");

-- CreateIndex
CREATE INDEX "SeedCatalog_verticalSlug_idx" ON "SeedCatalog"("verticalSlug");

-- CreateIndex
CREATE INDEX "SeedCatalog_updatedAt_idx" ON "SeedCatalog"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "SeedCatalog_verticalSlug_subIntent_key" ON "SeedCatalog"("verticalSlug", "subIntent");

-- CreateIndex
CREATE UNIQUE INDEX "DynamicQr_code_key" ON "DynamicQr"("code");

-- CreateIndex
CREATE INDEX "DynamicQr_storeId_idx" ON "DynamicQr"("storeId");

-- CreateIndex
CREATE INDEX "DynamicQr_code_idx" ON "DynamicQr"("code");

-- CreateIndex
CREATE INDEX "DynamicQr_isActive_idx" ON "DynamicQr"("isActive");

-- CreateIndex
CREATE INDEX "ScanEvent_dynamicQrId_idx" ON "ScanEvent"("dynamicQrId");

-- CreateIndex
CREATE INDEX "ScanEvent_storeId_idx" ON "ScanEvent"("storeId");

-- CreateIndex
CREATE INDEX "ScanEvent_scannedAt_idx" ON "ScanEvent"("scannedAt");
