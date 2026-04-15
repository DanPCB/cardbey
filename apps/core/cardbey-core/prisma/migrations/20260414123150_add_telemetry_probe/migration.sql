-- CreateTable
CREATE TABLE "TelemetryProbe" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tag" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "missionId" TEXT,
    "payload" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_MissionPipeline" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'requested',
    "runState" TEXT NOT NULL DEFAULT 'idle',
    "executionMode" TEXT NOT NULL DEFAULT 'AUTO_RUN',
    "targetType" TEXT NOT NULL,
    "targetId" TEXT,
    "targetLabel" TEXT,
    "tenantId" TEXT,
    "createdBy" TEXT,
    "assignedAgent" TEXT,
    "requiresConfirmation" BOOLEAN NOT NULL DEFAULT false,
    "confirmationReason" TEXT,
    "currentStepId" TEXT,
    "progressCompletedSteps" INTEGER NOT NULL DEFAULT 0,
    "progressTotalSteps" INTEGER NOT NULL DEFAULT 0,
    "blockersJson" JSONB,
    "warningsJson" JSONB,
    "outputsJson" JSONB,
    "metadataJson" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    "failedAt" DATETIME,
    "cancelledAt" DATETIME
);
INSERT INTO "new_MissionPipeline" ("assignedAgent", "blockersJson", "cancelledAt", "completedAt", "confirmationReason", "createdAt", "createdBy", "currentStepId", "description", "failedAt", "id", "metadataJson", "outputsJson", "progressCompletedSteps", "progressTotalSteps", "requiresConfirmation", "runState", "startedAt", "status", "targetId", "targetLabel", "targetType", "tenantId", "title", "type", "updatedAt", "warningsJson") SELECT "assignedAgent", "blockersJson", "cancelledAt", "completedAt", "confirmationReason", "createdAt", "createdBy", "currentStepId", "description", "failedAt", "id", "metadataJson", "outputsJson", "progressCompletedSteps", "progressTotalSteps", "requiresConfirmation", "runState", "startedAt", "status", "targetId", "targetLabel", "targetType", "tenantId", "title", "type", "updatedAt", "warningsJson" FROM "MissionPipeline";
DROP TABLE "MissionPipeline";
ALTER TABLE "new_MissionPipeline" RENAME TO "MissionPipeline";
CREATE INDEX "MissionPipeline_tenantId_status_idx" ON "MissionPipeline"("tenantId", "status");
CREATE INDEX "MissionPipeline_createdAt_idx" ON "MissionPipeline"("createdAt");
CREATE INDEX "MissionPipeline_status_runState_idx" ON "MissionPipeline"("status", "runState");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "TelemetryProbe_tag_idx" ON "TelemetryProbe"("tag");

-- CreateIndex
CREATE INDEX "TelemetryProbe_createdAt_idx" ON "TelemetryProbe"("createdAt");

-- CreateIndex
CREATE INDEX "TelemetryProbe_missionId_idx" ON "TelemetryProbe"("missionId");
