-- CreateTable
CREATE TABLE "ActivityEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT,
    "deviceId" TEXT,
    "storeId" TEXT,
    "userId" TEXT,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "occurredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "TenantReport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "contentMd" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "tags" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "ActivityEvent_tenantId_occurredAt_idx" ON "ActivityEvent"("tenantId", "occurredAt");

-- CreateIndex
CREATE INDEX "ActivityEvent_deviceId_occurredAt_idx" ON "ActivityEvent"("deviceId", "occurredAt");

-- CreateIndex
CREATE INDEX "ActivityEvent_storeId_occurredAt_idx" ON "ActivityEvent"("storeId", "occurredAt");

-- CreateIndex
CREATE INDEX "ActivityEvent_type_occurredAt_idx" ON "ActivityEvent"("type", "occurredAt");

-- CreateIndex
CREATE INDEX "TenantReport_tenantId_kind_periodKey_idx" ON "TenantReport"("tenantId", "kind", "periodKey");
