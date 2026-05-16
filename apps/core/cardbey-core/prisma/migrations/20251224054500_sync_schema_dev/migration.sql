/*
  Warnings:

  - A unique constraint covering the columns `[businessId,normalizedName]` on the table `Product` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Product" ADD COLUMN "normalizedName" TEXT;

-- CreateTable
CREATE TABLE "DeviceStatusSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "deviceId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "lastSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "appVersion" TEXT,
    "platform" TEXT,
    "stateJson" JSONB,
    "healthJson" JSONB,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "DeviceEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "deviceId" TEXT,
    "sessionId" TEXT,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "message" TEXT,
    "dataJson" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "DeviceStatusSnapshot_deviceId_key" ON "DeviceStatusSnapshot"("deviceId");

-- CreateIndex
CREATE INDEX "DeviceStatusSnapshot_tenantId_storeId_idx" ON "DeviceStatusSnapshot"("tenantId", "storeId");

-- CreateIndex
CREATE INDEX "DeviceStatusSnapshot_deviceId_idx" ON "DeviceStatusSnapshot"("deviceId");

-- CreateIndex
CREATE INDEX "DeviceEvent_tenantId_storeId_createdAt_idx" ON "DeviceEvent"("tenantId", "storeId", "createdAt");

-- CreateIndex
CREATE INDEX "DeviceEvent_deviceId_createdAt_idx" ON "DeviceEvent"("deviceId", "createdAt");

-- CreateIndex
CREATE INDEX "DeviceEvent_sessionId_createdAt_idx" ON "DeviceEvent"("sessionId", "createdAt");

-- CreateIndex
CREATE INDEX "DeviceEvent_type_createdAt_idx" ON "DeviceEvent"("type", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Product_businessId_normalizedName_key" ON "Product"("businessId", "normalizedName");
