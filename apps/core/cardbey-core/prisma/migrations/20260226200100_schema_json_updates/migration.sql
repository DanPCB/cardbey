/*
  Warnings:

  - You are about to drop the `FunnelEvent` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `OrchestraStartIdempotency` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `PublishIdempotency` table. If the table is not empty, all the data it contains will be lost.
  - You are about to alter the column `content` on the `AgentMessage` table. The data in that column could be lost. The data in that column will be cast from `String` to `Json`.
  - You are about to alter the column `payload` on the `AgentMessage` table. The data in that column could be lost. The data in that column will be cast from `String` to `Json`.
  - You are about to alter the column `visibleToUser` on the `AgentMessage` table. The data in that column could be lost. The data in that column will be cast from `Int` to `Boolean`.
  - You are about to alter the column `context` on the `Mission` table. The data in that column could be lost. The data in that column will be cast from `String` to `Json`.
  - You are about to alter the column `details` on the `OrchestratorRunReward` table. The data in that column could be lost. The data in that column will be cast from `String` to `Json`.
  - You are about to alter the column `tags` on the `SeedAsset` table. The data in that column could be lost. The data in that column will be cast from `String` to `Json`.
  - You are about to alter the column `meta` on the `SeedIngestionJob` table. The data in that column could be lost. The data in that column will be cast from `String` to `Json`.

*/
-- DropIndex
DROP INDEX "FunnelEvent_createdAt_idx";

-- DropIndex
DROP INDEX "FunnelEvent_correlationId_idx";

-- DropIndex
DROP INDEX "FunnelEvent_step_idx";

-- DropIndex
DROP INDEX "OrchestraStartIdempotency_status_idx";

-- DropIndex
DROP INDEX "OrchestraStartIdempotency_expiresAt_idx";

-- DropIndex
DROP INDEX "OrchestraStartIdempotency_keyHash_idx";

-- DropIndex
DROP INDEX "OrchestraStartIdempotency_keyHash_key";

-- DropIndex
DROP INDEX "PublishIdempotency_status_idx";

-- DropIndex
DROP INDEX "PublishIdempotency_expiresAt_idx";

-- DropIndex
DROP INDEX "PublishIdempotency_keyHash_idx";

-- DropIndex
DROP INDEX "PublishIdempotency_keyHash_key";

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "FunnelEvent";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "OrchestraStartIdempotency";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "PublishIdempotency";
PRAGMA foreign_keys=on;

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
    "threadId" TEXT,
    CONSTRAINT "AgentMessage_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "OrchestratorTask" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "AgentMessage_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "ChatThread" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_AgentMessage" ("channel", "content", "createdAt", "id", "messageType", "missionId", "payload", "performative", "senderId", "senderType", "taskId", "threadId", "visibleToUser") SELECT "channel", "content", "createdAt", "id", "messageType", "missionId", "payload", "performative", "senderId", "senderType", "taskId", "threadId", "visibleToUser" FROM "AgentMessage";
DROP TABLE "AgentMessage";
ALTER TABLE "new_AgentMessage" RENAME TO "AgentMessage";
CREATE INDEX "AgentMessage_missionId_idx" ON "AgentMessage"("missionId");
CREATE INDEX "AgentMessage_missionId_channel_idx" ON "AgentMessage"("missionId", "channel");
CREATE INDEX "AgentMessage_createdAt_idx" ON "AgentMessage"("createdAt");
CREATE INDEX "AgentMessage_threadId_idx" ON "AgentMessage"("threadId");
CREATE TABLE "new_Mission" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "title" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "context" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Mission_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Mission" ("context", "createdAt", "createdByUserId", "id", "status", "tenantId", "title", "updatedAt") SELECT "context", "createdAt", "createdByUserId", "id", "status", "tenantId", "title", "updatedAt" FROM "Mission";
DROP TABLE "Mission";
ALTER TABLE "new_Mission" RENAME TO "Mission";
CREATE INDEX "Mission_tenantId_updatedAt_idx" ON "Mission"("tenantId", "updatedAt");
CREATE INDEX "Mission_createdByUserId_updatedAt_idx" ON "Mission"("createdByUserId", "updatedAt");
CREATE TABLE "new_OrchestratorRunReward" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orchestratorTaskId" TEXT NOT NULL,
    "missionId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "toolCompletenessScore" REAL NOT NULL,
    "outcomeQualityScore" REAL NOT NULL,
    "overallReward" REAL NOT NULL,
    "details" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_OrchestratorRunReward" ("createdAt", "details", "id", "missionId", "orchestratorTaskId", "outcomeQualityScore", "overallReward", "tenantId", "toolCompletenessScore") SELECT "createdAt", "details", "id", "missionId", "orchestratorTaskId", "outcomeQualityScore", "overallReward", "tenantId", "toolCompletenessScore" FROM "OrchestratorRunReward";
DROP TABLE "OrchestratorRunReward";
ALTER TABLE "new_OrchestratorRunReward" RENAME TO "OrchestratorRunReward";
CREATE INDEX "OrchestratorRunReward_orchestratorTaskId_idx" ON "OrchestratorRunReward"("orchestratorTaskId");
CREATE INDEX "OrchestratorRunReward_missionId_idx" ON "OrchestratorRunReward"("missionId");
CREATE INDEX "OrchestratorRunReward_tenantId_idx" ON "OrchestratorRunReward"("tenantId");
CREATE INDEX "OrchestratorRunReward_createdAt_idx" ON "OrchestratorRunReward"("createdAt");
CREATE TABLE "new_SeedAsset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "provider" TEXT NOT NULL,
    "providerAssetId" TEXT NOT NULL,
    "sourcePageUrl" TEXT,
    "photographerName" TEXT,
    "photographerUrl" TEXT,
    "licenseName" TEXT,
    "licenseUrl" TEXT,
    "attributionText" TEXT,
    "width" INTEGER,
    "height" INTEGER,
    "orientation" TEXT,
    "tags" JSONB,
    "vertical" TEXT,
    "categoryKey" TEXT,
    "sha256" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "rejectReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "ingestionJobId" TEXT,
    CONSTRAINT "SeedAsset_ingestionJobId_fkey" FOREIGN KEY ("ingestionJobId") REFERENCES "SeedIngestionJob" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_SeedAsset" ("attributionText", "categoryKey", "createdAt", "height", "id", "ingestionJobId", "licenseName", "licenseUrl", "orientation", "photographerName", "photographerUrl", "provider", "providerAssetId", "sha256", "sourcePageUrl", "status", "tags", "updatedAt", "vertical", "width") SELECT "attributionText", "categoryKey", "createdAt", "height", "id", "ingestionJobId", "licenseName", "licenseUrl", "orientation", "photographerName", "photographerUrl", "provider", "providerAssetId", "sha256", "sourcePageUrl", "status", "tags", "updatedAt", "vertical", "width" FROM "SeedAsset";
DROP TABLE "SeedAsset";
ALTER TABLE "new_SeedAsset" RENAME TO "SeedAsset";
CREATE INDEX "SeedAsset_provider_idx" ON "SeedAsset"("provider");
CREATE INDEX "SeedAsset_vertical_idx" ON "SeedAsset"("vertical");
CREATE INDEX "SeedAsset_categoryKey_idx" ON "SeedAsset"("categoryKey");
CREATE INDEX "SeedAsset_status_idx" ON "SeedAsset"("status");
CREATE INDEX "SeedAsset_ingestionJobId_idx" ON "SeedAsset"("ingestionJobId");
CREATE UNIQUE INDEX "SeedAsset_provider_providerAssetId_key" ON "SeedAsset"("provider", "providerAssetId");
CREATE UNIQUE INDEX "SeedAsset_sha256_key" ON "SeedAsset"("sha256");
CREATE TABLE "new_SeedIngestionJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "provider" TEXT,
    "status" TEXT NOT NULL DEFAULT 'running',
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    "meta" JSONB,
    "errorMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_SeedIngestionJob" ("completedAt", "createdAt", "errorMessage", "id", "meta", "provider", "startedAt", "status", "updatedAt") SELECT "completedAt", "createdAt", "errorMessage", "id", "meta", "provider", "startedAt", "status", "updatedAt" FROM "SeedIngestionJob";
DROP TABLE "SeedIngestionJob";
ALTER TABLE "new_SeedIngestionJob" RENAME TO "SeedIngestionJob";
CREATE INDEX "SeedIngestionJob_provider_idx" ON "SeedIngestionJob"("provider");
CREATE INDEX "SeedIngestionJob_status_idx" ON "SeedIngestionJob"("status");
CREATE INDEX "SeedIngestionJob_startedAt_idx" ON "SeedIngestionJob"("startedAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
