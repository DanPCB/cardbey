-- CreateTable
CREATE TABLE "MiGenerationJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT,
    "storeId" TEXT,
    "sourceType" TEXT NOT NULL,
    "sourceValue" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "message" TEXT,
    "errorJson" TEXT,
    "resultJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "PromoInstance" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "config" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "PromoDeployment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "publicId" TEXT NOT NULL,
    "instanceId" TEXT NOT NULL,
    "tenantId" TEXT,
    "storeId" TEXT,
    "qrScans" INTEGER NOT NULL DEFAULT 0,
    "landingViews" INTEGER NOT NULL DEFAULT 0,
    "registerClicks" INTEGER NOT NULL DEFAULT 0,
    "registrations" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "PromoTracking" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "instanceId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "meta" TEXT
);

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
    "tags" TEXT,
    "count" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_MenuImageMemory" ("category", "createdAt", "id", "normalizedName", "storeId", "tags", "updatedAt", "url") SELECT "category", "createdAt", "id", "normalizedName", "storeId", "tags", "updatedAt", "url" FROM "MenuImageMemory";
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
    "candidates" TEXT,
    "queryNorm" TEXT,
    "matchVersion" TEXT NOT NULL DEFAULT 'v1',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_MenuItemImageMatch" ("candidates", "confidence", "createdAt", "id", "matchVersion", "menuItemId", "queryNorm", "selectedUrl", "status", "updatedAt") SELECT "candidates", "confidence", "createdAt", "id", coalesce("matchVersion", 'v1') AS "matchVersion", "menuItemId", "queryNorm", "selectedUrl", coalesce("status", 'needs_review') AS "status", "updatedAt" FROM "MenuItemImageMatch";
DROP TABLE "MenuItemImageMatch";
ALTER TABLE "new_MenuItemImageMatch" RENAME TO "MenuItemImageMatch";
CREATE UNIQUE INDEX "MenuItemImageMatch_menuItemId_key" ON "MenuItemImageMatch"("menuItemId");
CREATE INDEX "MenuItemImageMatch_menuItemId_idx" ON "MenuItemImageMatch"("menuItemId");
CREATE INDEX "MenuItemImageMatch_status_idx" ON "MenuItemImageMatch"("status");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "MiGenerationJob_tenantId_idx" ON "MiGenerationJob"("tenantId");

-- CreateIndex
CREATE INDEX "MiGenerationJob_storeId_idx" ON "MiGenerationJob"("storeId");

-- CreateIndex
CREATE INDEX "MiGenerationJob_status_idx" ON "MiGenerationJob"("status");

-- CreateIndex
CREATE INDEX "MiGenerationJob_sourceType_idx" ON "MiGenerationJob"("sourceType");

-- CreateIndex
CREATE INDEX "MiGenerationJob_createdAt_idx" ON "MiGenerationJob"("createdAt");

-- CreateIndex
CREATE INDEX "PromoInstance_tenantId_idx" ON "PromoInstance"("tenantId");

-- CreateIndex
CREATE INDEX "PromoInstance_storeId_idx" ON "PromoInstance"("storeId");

-- CreateIndex
CREATE INDEX "PromoInstance_draftId_idx" ON "PromoInstance"("draftId");

-- CreateIndex
CREATE INDEX "PromoInstance_status_idx" ON "PromoInstance"("status");

-- CreateIndex
CREATE INDEX "PromoInstance_targetType_targetId_idx" ON "PromoInstance"("targetType", "targetId");

-- CreateIndex
CREATE UNIQUE INDEX "PromoDeployment_publicId_key" ON "PromoDeployment"("publicId");

-- CreateIndex
CREATE INDEX "PromoDeployment_instanceId_idx" ON "PromoDeployment"("instanceId");

-- CreateIndex
CREATE INDEX "PromoDeployment_publicId_idx" ON "PromoDeployment"("publicId");

-- CreateIndex
CREATE INDEX "PromoDeployment_tenantId_idx" ON "PromoDeployment"("tenantId");

-- CreateIndex
CREATE INDEX "PromoDeployment_storeId_idx" ON "PromoDeployment"("storeId");

-- CreateIndex
CREATE INDEX "PromoTracking_instanceId_idx" ON "PromoTracking"("instanceId");

-- CreateIndex
CREATE INDEX "PromoTracking_event_idx" ON "PromoTracking"("event");

-- CreateIndex
CREATE INDEX "PromoTracking_timestamp_idx" ON "PromoTracking"("timestamp");

-- CreateIndex
CREATE INDEX "PromoTracking_instanceId_event_idx" ON "PromoTracking"("instanceId", "event");
