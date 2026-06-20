-- Mission Pipeline v1 (SQLite) — referenced by conversation_messages and performer runtime.
CREATE TABLE IF NOT EXISTS "MissionPipeline" (
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
    "pipelineConfig" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    "failedAt" DATETIME,
    "cancelledAt" DATETIME
);

CREATE INDEX IF NOT EXISTS "MissionPipeline_tenantId_status_idx" ON "MissionPipeline"("tenantId", "status");
CREATE INDEX IF NOT EXISTS "MissionPipeline_createdAt_idx" ON "MissionPipeline"("createdAt");
CREATE INDEX IF NOT EXISTS "MissionPipeline_status_runState_idx" ON "MissionPipeline"("status", "runState");

CREATE TABLE IF NOT EXISTS "MissionPipelineStep" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "missionId" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL,
    "stepKind" TEXT NOT NULL DEFAULT 'action',
    "toolName" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "configJson" JSONB,
    "inputJson" JSONB,
    "outputJson" JSONB,
    "outputsJson" JSONB,
    "metadata" JSONB,
    "errorJson" JSONB,
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MissionPipelineStep_missionId_fkey" FOREIGN KEY ("missionId") REFERENCES "MissionPipeline" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "MissionPipelineStep_missionId_orderIndex_idx" ON "MissionPipelineStep"("missionId", "orderIndex");

CREATE TABLE IF NOT EXISTS "MissionContext" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "missionId" TEXT NOT NULL,
    "contextJson" TEXT NOT NULL DEFAULT '{}',
    "snapshotsJson" TEXT NOT NULL DEFAULT '[]',
    "outcomeJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "MissionContext_missionId_key" ON "MissionContext"("missionId");
CREATE INDEX IF NOT EXISTS "MissionContext_missionId_idx" ON "MissionContext"("missionId");
