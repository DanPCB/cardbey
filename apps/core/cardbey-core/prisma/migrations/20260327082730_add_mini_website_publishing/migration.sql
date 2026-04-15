/*
  Warnings:

  - You are about to drop the column `agentThreadId` on the `MissionRun` table. All the data in the column will be lost.
  - You are about to drop the column `artifactSnapshot` on the `MissionRun` table. All the data in the column will be lost.
  - You are about to drop the column `attempts` on the `MissionRun` table. All the data in the column will be lost.
  - You are about to drop the column `currentDraftId` on the `MissionRun` table. All the data in the column will be lost.
  - You are about to drop the column `currentGenerationRunId` on the `MissionRun` table. All the data in the column will be lost.
  - You are about to drop the column `currentJobId` on the `MissionRun` table. All the data in the column will be lost.
  - You are about to drop the column `currentStage` on the `MissionRun` table. All the data in the column will be lost.
  - You are about to drop the column `currentStoreId` on the `MissionRun` table. All the data in the column will be lost.
  - You are about to drop the column `goal` on the `MissionRun` table. All the data in the column will be lost.
  - You are about to drop the column `lastError` on the `MissionRun` table. All the data in the column will be lost.
  - You are about to drop the column `maxAttempts` on the `MissionRun` table. All the data in the column will be lost.
  - You are about to drop the column `missionId` on the `MissionRun` table. All the data in the column will be lost.
  - You are about to drop the column `missionType` on the `MissionRun` table. All the data in the column will be lost.
  - You are about to drop the column `runPipelineAsSingleStep` on the `MissionRun` table. All the data in the column will be lost.
  - You are about to drop the column `tenantId` on the `MissionRun` table. All the data in the column will be lost.
  - Added the required column `intentType` to the `MissionRun` table without a default value. This is not possible if the table is not empty.
  - Made the column `userId` on table `MissionRun` required. This step will fail if there are existing NULL values in that column.

*/
-- CreateTable
CREATE TABLE "MissionOperatorRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "missionId" TEXT NOT NULL,
    "missionType" TEXT NOT NULL,
    "goal" TEXT,
    "tenantId" TEXT,
    "userId" TEXT,
    "currentStage" TEXT NOT NULL DEFAULT 'planning',
    "currentDraftId" TEXT,
    "currentJobId" TEXT,
    "currentGenerationRunId" TEXT,
    "currentStoreId" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 20,
    "status" TEXT NOT NULL DEFAULT 'running',
    "lastError" JSONB,
    "artifactSnapshot" JSONB,
    "agentThreadId" TEXT,
    "runPipelineAsSingleStep" BOOLEAN DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "PublishedSite" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "storeId" TEXT NOT NULL,
    "draftStoreId" TEXT NOT NULL,
    "publishType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "errorMessage" TEXT,
    "siteSnapshot" JSONB NOT NULL,
    "themeId" TEXT,
    "publishedAt" DATETIME,
    "slug" TEXT,
    "customDomain" TEXT,
    "domainVerifyStatus" TEXT,
    "domainVerifiedAt" DATETIME,
    "tlsCertProvisioned" BOOLEAN NOT NULL DEFAULT false,
    "tlsCertExpiresAt" DATETIME,
    "agentServicesEnabled" BOOLEAN NOT NULL DEFAULT true,
    "apiKeyHash" TEXT,
    "totalViews" INTEGER NOT NULL DEFAULT 0,
    "lastViewedAt" DATETIME,
    CONSTRAINT "PublishedSite_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Business" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PublishedSite_draftStoreId_fkey" FOREIGN KEY ("draftStoreId") REFERENCES "DraftStore" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DomainVerifyAttempt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedSiteId" TEXT NOT NULL,
    "cnameFound" BOOLEAN NOT NULL,
    "cnameTarget" TEXT,
    "errorDetail" TEXT,
    CONSTRAINT "DomainVerifyAttempt_publishedSiteId_fkey" FOREIGN KEY ("publishedSiteId") REFERENCES "PublishedSite" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PublishEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedSiteId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "meta" JSONB,
    CONSTRAINT "PublishEvent_publishedSiteId_fkey" FOREIGN KEY ("publishedSiteId") REFERENCES "PublishedSite" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderNumber" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'unknown',
    "totalAmount" REAL NOT NULL DEFAULT 0,
    "currency" TEXT DEFAULT 'USD',
    "buyerUserId" TEXT NOT NULL,
    "sellerUserId" TEXT,
    "sellerStoreId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "OrderItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "price" REAL NOT NULL DEFAULT 0,
    "currency" TEXT DEFAULT 'USD',
    CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OrderStatusEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "actorType" TEXT NOT NULL,
    "actorRole" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OrderStatusEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OrderCancelRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "requestedByUserId" TEXT NOT NULL,
    "reason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "reviewedByUserId" TEXT,
    "reviewNote" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" DATETIME,
    CONSTRAINT "OrderCancelRequest_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AgentMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "missionId" TEXT NOT NULL,
    "senderType" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "visibleToUser" BOOLEAN NOT NULL DEFAULT true,
    "channel" TEXT NOT NULL,
    "performative" TEXT,
    "messageType" TEXT NOT NULL DEFAULT 'text',
    "content" JSONB NOT NULL,
    "payload" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "taskId" TEXT,
    "missionRunId" TEXT,
    "threadId" TEXT,
    CONSTRAINT "AgentMessage_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "OrchestratorTask" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "AgentMessage_missionRunId_fkey" FOREIGN KEY ("missionRunId") REFERENCES "MissionRun" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "AgentMessage_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "ChatThread" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_AgentMessage" ("channel", "content", "createdAt", "id", "messageType", "missionId", "payload", "performative", "senderId", "senderType", "taskId", "threadId", "visibleToUser") SELECT "channel", "content", "createdAt", "id", "messageType", "missionId", "payload", "performative", "senderId", "senderType", "taskId", "threadId", "visibleToUser" FROM "AgentMessage";
DROP TABLE "AgentMessage";
ALTER TABLE "new_AgentMessage" RENAME TO "AgentMessage";
CREATE INDEX "AgentMessage_missionId_idx" ON "AgentMessage"("missionId");
CREATE INDEX "AgentMessage_missionId_channel_idx" ON "AgentMessage"("missionId", "channel");
CREATE INDEX "AgentMessage_createdAt_idx" ON "AgentMessage"("createdAt");
CREATE INDEX "AgentMessage_threadId_idx" ON "AgentMessage"("threadId");
CREATE INDEX "AgentMessage_missionRunId_idx" ON "AgentMessage"("missionRunId");
CREATE TABLE "new_MissionRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "storeId" TEXT,
    "intentType" TEXT NOT NULL,
    "title" TEXT,
    "mode" TEXT NOT NULL DEFAULT 'fast',
    "status" TEXT NOT NULL DEFAULT 'queued',
    "runState" TEXT NOT NULL DEFAULT 'idle',
    "steps" JSONB,
    "lastResult" JSONB,
    "planSnapshot" JSONB,
    "consensusRecord" JSONB,
    "contentBundle" JSONB,
    "scheduleBundle" JSONB,
    "requiresConfirmation" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_MissionRun" ("createdAt", "id", "status", "updatedAt", "userId") SELECT "createdAt", "id", "status", "updatedAt", "userId" FROM "MissionRun";
DROP TABLE "MissionRun";
ALTER TABLE "new_MissionRun" RENAME TO "MissionRun";
CREATE INDEX "MissionRun_userId_idx" ON "MissionRun"("userId");
CREATE INDEX "MissionRun_storeId_idx" ON "MissionRun"("storeId");
CREATE INDEX "MissionRun_status_idx" ON "MissionRun"("status");
CREATE INDEX "MissionRun_createdAt_idx" ON "MissionRun"("createdAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "MissionOperatorRun_missionId_idx" ON "MissionOperatorRun"("missionId");

-- CreateIndex
CREATE INDEX "MissionOperatorRun_status_idx" ON "MissionOperatorRun"("status");

-- CreateIndex
CREATE INDEX "MissionOperatorRun_createdAt_idx" ON "MissionOperatorRun"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PublishedSite_slug_key" ON "PublishedSite"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "PublishedSite_customDomain_key" ON "PublishedSite"("customDomain");

-- CreateIndex
CREATE INDEX "PublishedSite_storeId_idx" ON "PublishedSite"("storeId");

-- CreateIndex
CREATE INDEX "PublishedSite_draftStoreId_idx" ON "PublishedSite"("draftStoreId");

-- CreateIndex
CREATE INDEX "PublishedSite_slug_idx" ON "PublishedSite"("slug");

-- CreateIndex
CREATE INDEX "PublishedSite_customDomain_idx" ON "PublishedSite"("customDomain");

-- CreateIndex
CREATE INDEX "PublishedSite_status_idx" ON "PublishedSite"("status");

-- CreateIndex
CREATE INDEX "DomainVerifyAttempt_publishedSiteId_idx" ON "DomainVerifyAttempt"("publishedSiteId");

-- CreateIndex
CREATE INDEX "PublishEvent_publishedSiteId_idx" ON "PublishEvent"("publishedSiteId");

-- CreateIndex
CREATE INDEX "Order_buyerUserId_idx" ON "Order"("buyerUserId");

-- CreateIndex
CREATE INDEX "Order_sellerUserId_idx" ON "Order"("sellerUserId");

-- CreateIndex
CREATE INDEX "Order_sellerStoreId_idx" ON "Order"("sellerStoreId");

-- CreateIndex
CREATE INDEX "Order_status_idx" ON "Order"("status");

-- CreateIndex
CREATE INDEX "Order_createdAt_idx" ON "Order"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Order_orderNumber_key" ON "Order"("orderNumber");

-- CreateIndex
CREATE INDEX "OrderItem_orderId_idx" ON "OrderItem"("orderId");

-- CreateIndex
CREATE INDEX "OrderStatusEvent_orderId_idx" ON "OrderStatusEvent"("orderId");

-- CreateIndex
CREATE INDEX "OrderStatusEvent_createdAt_idx" ON "OrderStatusEvent"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "OrderCancelRequest_orderId_key" ON "OrderCancelRequest"("orderId");

-- CreateIndex
CREATE INDEX "OrderCancelRequest_orderId_idx" ON "OrderCancelRequest"("orderId");

-- CreateIndex
CREATE INDEX "OrderCancelRequest_status_idx" ON "OrderCancelRequest"("status");
