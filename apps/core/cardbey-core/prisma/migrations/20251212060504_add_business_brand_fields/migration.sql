/*
  Warnings:

  - You are about to alter the column `textStylesJson` on the `MiVideoTemplate` table. The data in that column could be lost. The data in that column will be cast from `String` to `Json`.
  - You are about to alter the column `textZonesJson` on the `MiVideoTemplate` table. The data in that column could be lost. The data in that column will be cast from `String` to `Json`.

*/
-- AlterTable
ALTER TABLE "Business" ADD COLUMN "heroText" TEXT;
ALTER TABLE "Business" ADD COLUMN "primaryColor" TEXT;
ALTER TABLE "Business" ADD COLUMN "secondaryColor" TEXT;
ALTER TABLE "Business" ADD COLUMN "stylePreferences" JSONB;
ALTER TABLE "Business" ADD COLUMN "tagline" TEXT;

-- AlterTable
ALTER TABLE "CreativeTemplate" ADD COLUMN "businessCategories" JSONB;
ALTER TABLE "CreativeTemplate" ADD COLUMN "styleTags" JSONB;
ALTER TABLE "CreativeTemplate" ADD COLUMN "useCases" JSONB;

-- CreateTable
CREATE TABLE "DevicePairing" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "pairingCode" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "deviceId" TEXT,
    "deviceLabel" TEXT
);

-- CreateTable
CREATE TABLE "MiMusicTrack" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "audioUrl" TEXT NOT NULL,
    "duration" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "DraftStore" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "mode" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "input" JSONB NOT NULL,
    "preview" JSONB,
    "error" TEXT,
    "committedStoreId" TEXT,
    "committedUserId" TEXT,
    "ipHash" TEXT,
    "userAgent" TEXT
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_MiVideoTemplate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "occasionType" TEXT NOT NULL,
    "orientation" TEXT NOT NULL,
    "backgroundUrl" TEXT NOT NULL,
    "posterUrl" TEXT NOT NULL,
    "textZonesJson" JSONB NOT NULL,
    "textStylesJson" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_MiVideoTemplate" ("backgroundUrl", "createdAt", "id", "isActive", "key", "label", "occasionType", "orientation", "posterUrl", "textStylesJson", "textZonesJson", "updatedAt") SELECT "backgroundUrl", "createdAt", "id", "isActive", "key", "label", "occasionType", "orientation", "posterUrl", "textStylesJson", "textZonesJson", "updatedAt" FROM "MiVideoTemplate";
DROP TABLE "MiVideoTemplate";
ALTER TABLE "new_MiVideoTemplate" RENAME TO "MiVideoTemplate";
CREATE UNIQUE INDEX "MiVideoTemplate_key_key" ON "MiVideoTemplate"("key");
CREATE INDEX "MiVideoTemplate_occasionType_idx" ON "MiVideoTemplate"("occasionType");
CREATE INDEX "MiVideoTemplate_orientation_idx" ON "MiVideoTemplate"("orientation");
CREATE INDEX "MiVideoTemplate_isActive_idx" ON "MiVideoTemplate"("isActive");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "DevicePairing_pairingCode_key" ON "DevicePairing"("pairingCode");

-- CreateIndex
CREATE INDEX "DevicePairing_pairingCode_idx" ON "DevicePairing"("pairingCode");

-- CreateIndex
CREATE INDEX "DevicePairing_tenantId_storeId_idx" ON "DevicePairing"("tenantId", "storeId");

-- CreateIndex
CREATE INDEX "DevicePairing_status_idx" ON "DevicePairing"("status");

-- CreateIndex
CREATE INDEX "DevicePairing_expiresAt_idx" ON "DevicePairing"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "MiMusicTrack_key_key" ON "MiMusicTrack"("key");

-- CreateIndex
CREATE INDEX "MiMusicTrack_category_idx" ON "MiMusicTrack"("category");

-- CreateIndex
CREATE INDEX "MiMusicTrack_isActive_idx" ON "MiMusicTrack"("isActive");

-- CreateIndex
CREATE INDEX "MiMusicTrack_key_idx" ON "MiMusicTrack"("key");

-- CreateIndex
CREATE INDEX "DraftStore_expiresAt_idx" ON "DraftStore"("expiresAt");

-- CreateIndex
CREATE INDEX "DraftStore_status_idx" ON "DraftStore"("status");

-- CreateIndex
CREATE INDEX "DraftStore_committedStoreId_idx" ON "DraftStore"("committedStoreId");

-- CreateIndex
CREATE INDEX "DraftStore_committedUserId_idx" ON "DraftStore"("committedUserId");
