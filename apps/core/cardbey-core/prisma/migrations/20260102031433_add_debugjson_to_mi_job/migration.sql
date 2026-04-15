/*
  Warnings:

  - You are about to alter the column `tags` on the `MenuImageMemory` table. The data in that column could be lost. The data in that column will be cast from `String` to `Json`.
  - You are about to alter the column `candidates` on the `MenuItemImageMatch` table. The data in that column could be lost. The data in that column will be cast from `String` to `Json`.
  - You are about to alter the column `debugJson` on the `MiGenerationJob` table. The data in that column could be lost. The data in that column will be cast from `String` to `Json`.
  - You are about to alter the column `errorJson` on the `MiGenerationJob` table. The data in that column could be lost. The data in that column will be cast from `String` to `Json`.
  - You are about to alter the column `resultJson` on the `MiGenerationJob` table. The data in that column could be lost. The data in that column will be cast from `String` to `Json`.
  - You are about to alter the column `config` on the `PromoInstance` table. The data in that column could be lost. The data in that column will be cast from `String` to `Json`.
  - You are about to alter the column `meta` on the `PromoTracking` table. The data in that column could be lost. The data in that column will be cast from `String` to `Json`.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_MenuImageMemory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "storeId" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "url" TEXT,
    "selectedUrl" TEXT,
    "selectedAssetId" TEXT,
    "category" TEXT,
    "tags" JSONB,
    "count" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_MenuImageMemory" ("category", "count", "createdAt", "id", "normalizedName", "selectedAssetId", "selectedUrl", "storeId", "tags", "updatedAt", "url") SELECT "category", "count", "createdAt", "id", "normalizedName", "selectedAssetId", "selectedUrl", "storeId", "tags", "updatedAt", "url" FROM "MenuImageMemory";
DROP TABLE "MenuImageMemory";
ALTER TABLE "new_MenuImageMemory" RENAME TO "MenuImageMemory";
CREATE INDEX "MenuImageMemory_storeId_idx" ON "MenuImageMemory"("storeId");
CREATE INDEX "MenuImageMemory_normalizedName_idx" ON "MenuImageMemory"("normalizedName");
CREATE INDEX "MenuImageMemory_selectedAssetId_idx" ON "MenuImageMemory"("selectedAssetId");
CREATE UNIQUE INDEX "MenuImageMemory_storeId_normalizedName_key" ON "MenuImageMemory"("storeId", "normalizedName");
CREATE TABLE "new_MenuItemImageMatch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "menuItemId" TEXT NOT NULL,
    "selectedUrl" TEXT,
    "confidence" REAL,
    "status" TEXT NOT NULL DEFAULT 'needs_review',
    "candidates" JSONB,
    "queryNorm" TEXT,
    "matchVersion" TEXT NOT NULL DEFAULT 'v1',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_MenuItemImageMatch" ("candidates", "confidence", "createdAt", "id", "matchVersion", "menuItemId", "queryNorm", "selectedUrl", "status", "updatedAt") SELECT "candidates", "confidence", "createdAt", "id", "matchVersion", "menuItemId", "queryNorm", "selectedUrl", "status", "updatedAt" FROM "MenuItemImageMatch";
DROP TABLE "MenuItemImageMatch";
ALTER TABLE "new_MenuItemImageMatch" RENAME TO "MenuItemImageMatch";
CREATE UNIQUE INDEX "MenuItemImageMatch_menuItemId_key" ON "MenuItemImageMatch"("menuItemId");
CREATE INDEX "MenuItemImageMatch_menuItemId_idx" ON "MenuItemImageMatch"("menuItemId");
CREATE INDEX "MenuItemImageMatch_status_idx" ON "MenuItemImageMatch"("status");
CREATE TABLE "new_MiGenerationJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT,
    "storeId" TEXT,
    "sourceType" TEXT NOT NULL,
    "sourceValue" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "message" TEXT,
    "errorJson" JSONB,
    "resultJson" JSONB,
    "debugJson" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_MiGenerationJob" ("createdAt", "debugJson", "errorJson", "id", "message", "progress", "resultJson", "sourceType", "sourceValue", "status", "storeId", "tenantId", "updatedAt") SELECT "createdAt", "debugJson", "errorJson", "id", "message", "progress", "resultJson", "sourceType", "sourceValue", "status", "storeId", "tenantId", "updatedAt" FROM "MiGenerationJob";
DROP TABLE "MiGenerationJob";
ALTER TABLE "new_MiGenerationJob" RENAME TO "MiGenerationJob";
CREATE INDEX "MiGenerationJob_tenantId_idx" ON "MiGenerationJob"("tenantId");
CREATE INDEX "MiGenerationJob_storeId_idx" ON "MiGenerationJob"("storeId");
CREATE INDEX "MiGenerationJob_status_idx" ON "MiGenerationJob"("status");
CREATE INDEX "MiGenerationJob_sourceType_idx" ON "MiGenerationJob"("sourceType");
CREATE INDEX "MiGenerationJob_createdAt_idx" ON "MiGenerationJob"("createdAt");
CREATE TABLE "new_PromoInstance" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "config" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_PromoInstance" ("config", "createdAt", "draftId", "id", "status", "storeId", "targetId", "targetType", "tenantId", "updatedAt") SELECT "config", "createdAt", "draftId", "id", "status", "storeId", "targetId", "targetType", "tenantId", "updatedAt" FROM "PromoInstance";
DROP TABLE "PromoInstance";
ALTER TABLE "new_PromoInstance" RENAME TO "PromoInstance";
CREATE INDEX "PromoInstance_tenantId_idx" ON "PromoInstance"("tenantId");
CREATE INDEX "PromoInstance_storeId_idx" ON "PromoInstance"("storeId");
CREATE INDEX "PromoInstance_draftId_idx" ON "PromoInstance"("draftId");
CREATE INDEX "PromoInstance_status_idx" ON "PromoInstance"("status");
CREATE INDEX "PromoInstance_targetType_targetId_idx" ON "PromoInstance"("targetType", "targetId");
CREATE TABLE "new_PromoTracking" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "instanceId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "meta" JSONB
);
INSERT INTO "new_PromoTracking" ("event", "id", "instanceId", "meta", "timestamp") SELECT "event", "id", "instanceId", "meta", "timestamp" FROM "PromoTracking";
DROP TABLE "PromoTracking";
ALTER TABLE "new_PromoTracking" RENAME TO "PromoTracking";
CREATE INDEX "PromoTracking_instanceId_idx" ON "PromoTracking"("instanceId");
CREATE INDEX "PromoTracking_event_idx" ON "PromoTracking"("event");
CREATE INDEX "PromoTracking_timestamp_idx" ON "PromoTracking"("timestamp");
CREATE INDEX "PromoTracking_instanceId_event_idx" ON "PromoTracking"("instanceId", "event");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
