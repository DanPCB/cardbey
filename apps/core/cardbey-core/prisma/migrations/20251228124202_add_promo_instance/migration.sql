-- CreateTable
CREATE TABLE "PromoInstance" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT,
    "storeId" TEXT,
    "draftId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "targetType" TEXT,
    "targetId" TEXT,
    "config" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "PromoTracking" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "instanceId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "meta" JSONB
);

-- CreateTable
CREATE TABLE "StoreDraftCommit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT,
    "userId" TEXT,
    "jobId" TEXT NOT NULL,
    "storeId" TEXT,
    "idempotencyKey" TEXT,
    "draftHash" TEXT NOT NULL,
    "patchJson" JSONB NOT NULL,
    "summaryJson" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "PromoInstance_tenantId_idx" ON "PromoInstance"("tenantId");

-- CreateIndex
CREATE INDEX "PromoInstance_storeId_idx" ON "PromoInstance"("storeId");

-- CreateIndex
CREATE INDEX "PromoInstance_draftId_idx" ON "PromoInstance"("draftId");

-- CreateIndex
CREATE INDEX "PromoInstance_status_idx" ON "PromoInstance"("status");

-- CreateIndex
CREATE INDEX "PromoInstance_tenantId_storeId_idx" ON "PromoInstance"("tenantId", "storeId");

-- CreateIndex
CREATE INDEX "PromoTracking_instanceId_idx" ON "PromoTracking"("instanceId");

-- CreateIndex
CREATE INDEX "PromoTracking_event_idx" ON "PromoTracking"("event");

-- CreateIndex
CREATE INDEX "PromoTracking_timestamp_idx" ON "PromoTracking"("timestamp");

-- CreateIndex
CREATE INDEX "PromoTracking_instanceId_event_idx" ON "PromoTracking"("instanceId", "event");

-- CreateIndex
CREATE INDEX "StoreDraftCommit_tenantId_idx" ON "StoreDraftCommit"("tenantId");

-- CreateIndex
CREATE INDEX "StoreDraftCommit_userId_idx" ON "StoreDraftCommit"("userId");

-- CreateIndex
CREATE INDEX "StoreDraftCommit_jobId_idx" ON "StoreDraftCommit"("jobId");

-- CreateIndex
CREATE INDEX "StoreDraftCommit_storeId_idx" ON "StoreDraftCommit"("storeId");

-- CreateIndex
CREATE INDEX "StoreDraftCommit_idempotencyKey_idx" ON "StoreDraftCommit"("idempotencyKey");

-- CreateIndex
CREATE INDEX "StoreDraftCommit_createdAt_idx" ON "StoreDraftCommit"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "StoreDraftCommit_tenantId_userId_idempotencyKey_key" ON "StoreDraftCommit"("tenantId", "userId", "idempotencyKey");
