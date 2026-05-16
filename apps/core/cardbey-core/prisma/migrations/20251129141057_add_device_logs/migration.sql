/*
  Warnings:

  - You are about to drop the column `duration` on the `SignageAsset` table. All the data in the column will be lost.
  - Added the required column `durationS` to the `SignageAsset` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Device" ADD COLUMN "lastScreenshotAt" DATETIME;
ALTER TABLE "Device" ADD COLUMN "lastScreenshotBase64" TEXT;
ALTER TABLE "Device" ADD COLUMN "platform" TEXT;
ALTER TABLE "Device" ADD COLUMN "type" TEXT;

-- AlterTable
ALTER TABLE "PromoRedemption" ADD COLUMN "orderId" TEXT;

-- CreateTable
CREATE TABLE "DeviceCommand" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "deviceId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DeviceCommand_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SystemEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "source" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "deviceId" TEXT,
    "tenantId" TEXT,
    "severity" TEXT NOT NULL DEFAULT 'info',
    "payload" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "SystemInsight" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'info',
    "category" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "payload" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "DeviceLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "deviceId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "level" TEXT NOT NULL DEFAULT 'info',
    "message" TEXT NOT NULL,
    "payload" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DeviceLog_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_SignageAsset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "durationS" INTEGER NOT NULL,
    "tags" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_SignageAsset" ("createdAt", "id", "storeId", "tags", "tenantId", "type", "url") SELECT "createdAt", "id", "storeId", "tags", "tenantId", "type", "url" FROM "SignageAsset";
DROP TABLE "SignageAsset";
ALTER TABLE "new_SignageAsset" RENAME TO "SignageAsset";
CREATE INDEX "SignageAsset_tenantId_idx" ON "SignageAsset"("tenantId");
CREATE INDEX "SignageAsset_storeId_idx" ON "SignageAsset"("storeId");
CREATE INDEX "SignageAsset_type_idx" ON "SignageAsset"("type");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "DeviceCommand_deviceId_idx" ON "DeviceCommand"("deviceId");

-- CreateIndex
CREATE INDEX "DeviceCommand_deviceId_status_idx" ON "DeviceCommand"("deviceId", "status");

-- CreateIndex
CREATE INDEX "DeviceCommand_status_idx" ON "DeviceCommand"("status");

-- CreateIndex
CREATE INDEX "DeviceCommand_createdAt_idx" ON "DeviceCommand"("createdAt");

-- CreateIndex
CREATE INDEX "SystemEvent_source_idx" ON "SystemEvent"("source");

-- CreateIndex
CREATE INDEX "SystemEvent_type_idx" ON "SystemEvent"("type");

-- CreateIndex
CREATE INDEX "SystemEvent_deviceId_idx" ON "SystemEvent"("deviceId");

-- CreateIndex
CREATE INDEX "SystemEvent_tenantId_idx" ON "SystemEvent"("tenantId");

-- CreateIndex
CREATE INDEX "SystemEvent_severity_idx" ON "SystemEvent"("severity");

-- CreateIndex
CREATE INDEX "SystemEvent_createdAt_idx" ON "SystemEvent"("createdAt");

-- CreateIndex
CREATE INDEX "SystemInsight_severity_idx" ON "SystemInsight"("severity");

-- CreateIndex
CREATE INDEX "SystemInsight_category_idx" ON "SystemInsight"("category");

-- CreateIndex
CREATE INDEX "SystemInsight_createdAt_idx" ON "SystemInsight"("createdAt");

-- CreateIndex
CREATE INDEX "DeviceLog_deviceId_idx" ON "DeviceLog"("deviceId");

-- CreateIndex
CREATE INDEX "DeviceLog_deviceId_createdAt_idx" ON "DeviceLog"("deviceId", "createdAt");

-- CreateIndex
CREATE INDEX "DeviceLog_source_idx" ON "DeviceLog"("source");

-- CreateIndex
CREATE INDEX "DeviceLog_level_idx" ON "DeviceLog"("level");

-- CreateIndex
CREATE INDEX "DeviceLog_createdAt_idx" ON "DeviceLog"("createdAt");
