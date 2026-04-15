/*
  Warnings:

  - You are about to alter the column `skills` on the `AgentProfile` table. The data in that column could be lost. The data in that column will be cast from `String` to `Json`.
  - You are about to alter the column `input` on the `AgentRun` table. The data in that column could be lost. The data in that column will be cast from `String` to `Json`.
  - You are about to alter the column `output` on the `AgentRun` table. The data in that column could be lost. The data in that column will be cast from `String` to `Json`.
  - You are about to alter the column `payload` on the `AgentTask` table. The data in that column could be lost. The data in that column will be cast from `String` to `Json`.
  - You are about to alter the column `metrics` on the `Assignment` table. The data in that column could be lost. The data in that column will be cast from `String` to `Json`.
  - You are about to alter the column `success` on the `Assignment` table. The data in that column could be lost. The data in that column will be cast from `Int` to `Boolean`.
  - You are about to alter the column `components` on the `Bid` table. The data in that column could be lost. The data in that column will be cast from `String` to `Json`.
  - You are about to alter the column `evidence` on the `WorkflowIncident` table. The data in that column could be lost. The data in that column will be cast from `String` to `Json`.
  - You are about to alter the column `payload` on the `WorkflowReport` table. The data in that column could be lost. The data in that column will be cast from `String` to `Json`.
  - You are about to alter the column `meta` on the `WorkflowRun` table. The data in that column could be lost. The data in that column will be cast from `String` to `Json`.
  - A unique constraint covering the columns `[missionId,sourceMessageId,normalizedLabel]` on the table `MissionTask` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "Business_userId_key";

-- AlterTable
ALTER TABLE "Business" ADD COLUMN "storefrontSettings" JSONB;

-- AlterTable
ALTER TABLE "MissionTask" ADD COLUMN "agentKeyRecommended" TEXT;
ALTER TABLE "MissionTask" ADD COLUMN "lastRunId" TEXT;
ALTER TABLE "MissionTask" ADD COLUMN "meta" JSONB;
ALTER TABLE "MissionTask" ADD COLUMN "normalizedLabel" TEXT;

-- AlterTable
ALTER TABLE "OrchestratorTask" ADD COLUMN "missionId" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN "verificationTokenRaw" TEXT;

-- CreateTable
CREATE TABLE "CampaignPlan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantKey" TEXT NOT NULL,
    "missionId" TEXT,
    "storeId" TEXT,
    "draftStoreId" TEXT,
    "objective" TEXT NOT NULL,
    "target" JSONB,
    "timeWindow" JSONB,
    "budget" JSONB,
    "channelsRequested" JSONB,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "CampaignValidationResult" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantKey" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "checks" JSONB NOT NULL,
    "blockers" JSONB NOT NULL,
    "warnings" JSONB NOT NULL,
    "risk" TEXT NOT NULL DEFAULT 'med',
    "confidence" TEXT NOT NULL DEFAULT 'med',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CampaignValidationResult_planId_fkey" FOREIGN KEY ("planId") REFERENCES "CampaignPlan" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CampaignV2" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantKey" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "missionId" TEXT,
    "storeId" TEXT,
    "draftStoreId" TEXT,
    "title" TEXT NOT NULL,
    "objective" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "degradedMode" JSONB,
    "allowedChannels" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CampaignV2_planId_fkey" FOREIGN KEY ("planId") REFERENCES "CampaignPlan" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CreativeCopy" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantKey" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'caption',
    "text" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CreativeCopy_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "CampaignV2" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CreativeAsset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantKey" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'image_prompt',
    "prompt" TEXT,
    "mediaId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CreativeAsset_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "CampaignV2" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CampaignScheduleItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantKey" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'scheduled_posts',
    "scheduledAt" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "creativeCopyId" TEXT,
    "creativeAssetId" TEXT,
    "externalRef" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CampaignScheduleItem_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "CampaignV2" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Offer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantKey" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'discount',
    "data" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Offer_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "CampaignV2" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ChannelDeployment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantKey" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'scheduled_posts',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "data" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ChannelDeployment_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "CampaignV2" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CampaignReport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantKey" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "missionId" TEXT,
    "summary" TEXT NOT NULL,
    "links" JSONB NOT NULL,
    "scheduleRecap" JSONB NOT NULL,
    "nextSteps" JSONB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CampaignReport_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "CampaignV2" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LlmCache" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantKey" TEXT NOT NULL DEFAULT 'global',
    "purpose" TEXT NOT NULL DEFAULT 'llm',
    "promptHash" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL DEFAULT '',
    "response" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL,
    "lastAccessedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "hitCount" INTEGER NOT NULL DEFAULT 0
);

-- CreateTable
CREATE TABLE "LlmUsageDaily" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantKey" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL DEFAULT '',
    "day" TEXT NOT NULL,
    "calls" INTEGER NOT NULL DEFAULT 0,
    "tokensIn" INTEGER NOT NULL DEFAULT 0,
    "tokensOut" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "IntentRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "missionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "agent" TEXT,
    "payload" JSONB,
    "result" JSONB,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "IntentRequest_missionId_fkey" FOREIGN KEY ("missionId") REFERENCES "Mission" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MissionEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "missionId" TEXT NOT NULL,
    "intentId" TEXT,
    "agent" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "MissionRun" (
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
CREATE TABLE "MissionPipeline" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'requested',
    "runState" TEXT NOT NULL DEFAULT 'idle',
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

-- CreateTable
CREATE TABLE "MissionPipelineStep" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "missionId" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL,
    "toolName" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "inputJson" JSONB,
    "outputJson" JSONB,
    "errorJson" JSONB,
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MissionPipelineStep_missionId_fkey" FOREIGN KEY ("missionId") REFERENCES "MissionPipeline" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "StoreOffer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "storeId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "priceText" TEXT,
    "startsAt" DATETIME,
    "endsAt" DATETIME,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "StoreOffer_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Business" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "IntentSignal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "offerId" TEXT,
    "code" TEXT,
    "userAgent" TEXT,
    "referrer" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "IntentOpportunity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "storeId" TEXT NOT NULL,
    "offerId" TEXT,
    "type" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'medium',
    "status" TEXT NOT NULL DEFAULT 'open',
    "summary" TEXT NOT NULL,
    "evidence" JSONB,
    "recommendedIntentType" TEXT NOT NULL,
    "payload" JSONB,
    "source" TEXT NOT NULL DEFAULT 'rules',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "OpportunityInferenceRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "storeId" TEXT NOT NULL,
    "lastRunAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "IntentNode" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "draftStoreId" TEXT,
    "storeId" TEXT,
    "intentKey" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "weight" REAL NOT NULL DEFAULT 0.5,
    "confidence" REAL,
    "source" TEXT NOT NULL DEFAULT 'rules',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "IntentEdge" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fromId" TEXT NOT NULL,
    "toId" TEXT NOT NULL,
    "kind" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "IntentEdge_fromId_fkey" FOREIGN KEY ("fromId") REFERENCES "IntentNode" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "IntentEdge_toId_fkey" FOREIGN KEY ("toId") REFERENCES "IntentNode" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "IntentGraphSignal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "intentNodeId" TEXT NOT NULL,
    "signalType" TEXT NOT NULL,
    "signalValue" TEXT NOT NULL,
    "strength" REAL NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "IntentGraphSignal_intentNodeId_fkey" FOREIGN KEY ("intentNodeId") REFERENCES "IntentNode" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OfferIntentMatch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "intentNodeId" TEXT NOT NULL,
    "offerType" TEXT NOT NULL,
    "offerRef" TEXT NOT NULL,
    "draftStoreId" TEXT,
    "storeId" TEXT,
    "score" REAL NOT NULL DEFAULT 0,
    "evidence" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OfferIntentMatch_intentNodeId_fkey" FOREIGN KEY ("intentNodeId") REFERENCES "IntentNode" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "StoreActionSuggestion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "draftStoreId" TEXT,
    "storeId" TEXT,
    "rank" INTEGER NOT NULL,
    "actionType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "payload" JSONB,
    "status" TEXT NOT NULL DEFAULT 'active',
    "cooldownUntil" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ActionOutcome" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "suggestionId" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "actorType" TEXT NOT NULL DEFAULT 'human',
    "actorId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ActionOutcome_suggestionId_fkey" FOREIGN KEY ("suggestionId") REFERENCES "StoreActionSuggestion" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Promotion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "storeId" TEXT,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT,
    "mediaType" TEXT,
    "mediaUrl" TEXT,
    "ctaLabel" TEXT,
    "ctaUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "startAt" DATETIME,
    "endAt" DATETIME,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "metadataJson" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "PromotionSlot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slotKey" TEXT NOT NULL,
    "surfaceType" TEXT NOT NULL,
    "displayMode" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "configJson" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "PromotionPlacement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "promotionId" TEXT NOT NULL,
    "slotId" TEXT NOT NULL,
    "storeId" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "startAt" DATETIME,
    "endAt" DATETIME,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "metadataJson" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PromotionPlacement_promotionId_fkey" FOREIGN KEY ("promotionId") REFERENCES "Promotion" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PromotionPlacement_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "PromotionSlot" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AgentProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "agentKey" TEXT NOT NULL,
    "skills" JSONB,
    "baseQuality" REAL NOT NULL DEFAULT 0.8,
    "baseCost" REAL NOT NULL DEFAULT 1,
    "baseLatency" INTEGER NOT NULL DEFAULT 5000,
    "reliabilityScore" REAL NOT NULL DEFAULT 0.8,
    "maxConcurrency" INTEGER NOT NULL DEFAULT 5,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_AgentProfile" ("agentKey", "baseCost", "baseLatency", "baseQuality", "createdAt", "id", "maxConcurrency", "reliabilityScore", "skills", "updatedAt") SELECT "agentKey", "baseCost", "baseLatency", "baseQuality", "createdAt", "id", "maxConcurrency", "reliabilityScore", "skills", "updatedAt" FROM "AgentProfile";
DROP TABLE "AgentProfile";
ALTER TABLE "new_AgentProfile" RENAME TO "AgentProfile";
CREATE UNIQUE INDEX "AgentProfile_agentKey_key" ON "AgentProfile"("agentKey");
CREATE INDEX "AgentProfile_agentKey_idx" ON "AgentProfile"("agentKey");
CREATE TABLE "new_AgentRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "missionId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "agentKey" TEXT NOT NULL,
    "triggerMessageId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "input" JSONB,
    "output" JSONB,
    "error" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AgentRun_missionId_fkey" FOREIGN KEY ("missionId") REFERENCES "Mission" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_AgentRun" ("agentKey", "createdAt", "error", "id", "input", "missionId", "output", "status", "tenantId", "triggerMessageId", "updatedAt") SELECT "agentKey", "createdAt", "error", "id", "input", "missionId", "output", "status", "tenantId", "triggerMessageId", "updatedAt" FROM "AgentRun";
DROP TABLE "AgentRun";
ALTER TABLE "new_AgentRun" RENAME TO "AgentRun";
CREATE INDEX "AgentRun_missionId_createdAt_idx" ON "AgentRun"("missionId", "createdAt");
CREATE INDEX "AgentRun_tenantId_createdAt_idx" ON "AgentRun"("tenantId", "createdAt");
CREATE INDEX "AgentRun_status_updatedAt_idx" ON "AgentRun"("status", "updatedAt");
CREATE TABLE "new_AgentTask" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "missionId" TEXT NOT NULL,
    "userMessageId" TEXT,
    "type" TEXT NOT NULL,
    "payload" JSONB,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_AgentTask" ("createdAt", "id", "missionId", "payload", "status", "type", "updatedAt", "userMessageId") SELECT "createdAt", "id", "missionId", "payload", "status", "type", "updatedAt", "userMessageId" FROM "AgentTask";
DROP TABLE "AgentTask";
ALTER TABLE "new_AgentTask" RENAME TO "AgentTask";
CREATE INDEX "AgentTask_missionId_createdAt_idx" ON "AgentTask"("missionId", "createdAt");
CREATE INDEX "AgentTask_status_idx" ON "AgentTask"("status");
CREATE INDEX "AgentTask_type_idx" ON "AgentTask"("type");
CREATE TABLE "new_Assignment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskId" TEXT NOT NULL,
    "agentKey" TEXT NOT NULL,
    "agentRunId" TEXT,
    "matchedScore" REAL NOT NULL,
    "assignedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    "success" BOOLEAN,
    "metrics" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Assignment_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "AgentTask" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Assignment_agentRunId_fkey" FOREIGN KEY ("agentRunId") REFERENCES "AgentRun" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Assignment" ("agentKey", "agentRunId", "assignedAt", "completedAt", "createdAt", "id", "matchedScore", "metrics", "success", "taskId", "updatedAt") SELECT "agentKey", "agentRunId", "assignedAt", "completedAt", "createdAt", "id", "matchedScore", "metrics", "success", "taskId", "updatedAt" FROM "Assignment";
DROP TABLE "Assignment";
ALTER TABLE "new_Assignment" RENAME TO "Assignment";
CREATE UNIQUE INDEX "Assignment_agentRunId_key" ON "Assignment"("agentRunId");
CREATE INDEX "Assignment_taskId_idx" ON "Assignment"("taskId");
CREATE INDEX "Assignment_agentKey_idx" ON "Assignment"("agentKey");
CREATE INDEX "Assignment_agentRunId_idx" ON "Assignment"("agentRunId");
CREATE INDEX "Assignment_assignedAt_idx" ON "Assignment"("assignedAt");
CREATE TABLE "new_Bid" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskId" TEXT NOT NULL,
    "agentKey" TEXT NOT NULL,
    "score" REAL NOT NULL,
    "components" JSONB,
    "rationale" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Bid_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "AgentTask" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Bid" ("agentKey", "components", "createdAt", "id", "rationale", "score", "taskId") SELECT "agentKey", "components", "createdAt", "id", "rationale", "score", "taskId" FROM "Bid";
DROP TABLE "Bid";
ALTER TABLE "new_Bid" RENAME TO "Bid";
CREATE INDEX "Bid_taskId_idx" ON "Bid"("taskId");
CREATE INDEX "Bid_agentKey_idx" ON "Bid"("agentKey");
CREATE UNIQUE INDEX "Bid_taskId_agentKey_key" ON "Bid"("taskId", "agentKey");
CREATE TABLE "new_WorkflowIncident" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workflowKey" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "draftStoreId" TEXT,
    "runId" TEXT,
    "reasonKey" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "evidence" JSONB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" DATETIME,
    CONSTRAINT "WorkflowIncident_draftStoreId_fkey" FOREIGN KEY ("draftStoreId") REFERENCES "DraftStore" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "WorkflowIncident_runId_fkey" FOREIGN KEY ("runId") REFERENCES "WorkflowRun" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_WorkflowIncident" ("createdAt", "draftStoreId", "evidence", "id", "reasonKey", "resolvedAt", "runId", "severity", "summary", "workflowKey") SELECT "createdAt", "draftStoreId", "evidence", "id", "reasonKey", "resolvedAt", "runId", "severity", "summary", "workflowKey" FROM "WorkflowIncident";
DROP TABLE "WorkflowIncident";
ALTER TABLE "new_WorkflowIncident" RENAME TO "WorkflowIncident";
CREATE INDEX "WorkflowIncident_workflowKey_idx" ON "WorkflowIncident"("workflowKey");
CREATE INDEX "WorkflowIncident_draftStoreId_idx" ON "WorkflowIncident"("draftStoreId");
CREATE INDEX "WorkflowIncident_runId_idx" ON "WorkflowIncident"("runId");
CREATE INDEX "WorkflowIncident_createdAt_idx" ON "WorkflowIncident"("createdAt");
CREATE TABLE "new_WorkflowReport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workflowKey" TEXT NOT NULL,
    "periodStart" DATETIME NOT NULL,
    "periodEnd" DATETIME NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_WorkflowReport" ("createdAt", "id", "payload", "periodEnd", "periodStart", "workflowKey") SELECT "createdAt", "id", "payload", "periodEnd", "periodStart", "workflowKey" FROM "WorkflowReport";
DROP TABLE "WorkflowReport";
ALTER TABLE "new_WorkflowReport" RENAME TO "WorkflowReport";
CREATE INDEX "WorkflowReport_workflowKey_idx" ON "WorkflowReport"("workflowKey");
CREATE INDEX "WorkflowReport_periodStart_periodEnd_idx" ON "WorkflowReport"("periodStart", "periodEnd");
CREATE TABLE "new_WorkflowRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workflowKey" TEXT NOT NULL,
    "draftStoreId" TEXT,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" DATETIME,
    "status" TEXT NOT NULL,
    "failureCode" TEXT,
    "meta" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "WorkflowRun_draftStoreId_fkey" FOREIGN KEY ("draftStoreId") REFERENCES "DraftStore" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_WorkflowRun" ("createdAt", "draftStoreId", "endedAt", "failureCode", "id", "meta", "startedAt", "status", "updatedAt", "workflowKey") SELECT "createdAt", "draftStoreId", "endedAt", "failureCode", "id", "meta", "startedAt", "status", "updatedAt", "workflowKey" FROM "WorkflowRun";
DROP TABLE "WorkflowRun";
ALTER TABLE "new_WorkflowRun" RENAME TO "WorkflowRun";
CREATE INDEX "WorkflowRun_workflowKey_idx" ON "WorkflowRun"("workflowKey");
CREATE INDEX "WorkflowRun_draftStoreId_idx" ON "WorkflowRun"("draftStoreId");
CREATE INDEX "WorkflowRun_startedAt_idx" ON "WorkflowRun"("startedAt");
CREATE INDEX "WorkflowRun_status_idx" ON "WorkflowRun"("status");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "CampaignPlan_tenantKey_createdAt_idx" ON "CampaignPlan"("tenantKey", "createdAt");

-- CreateIndex
CREATE INDEX "CampaignPlan_missionId_idx" ON "CampaignPlan"("missionId");

-- CreateIndex
CREATE INDEX "CampaignValidationResult_tenantKey_createdAt_idx" ON "CampaignValidationResult"("tenantKey", "createdAt");

-- CreateIndex
CREATE INDEX "CampaignValidationResult_planId_idx" ON "CampaignValidationResult"("planId");

-- CreateIndex
CREATE INDEX "CampaignV2_tenantKey_createdAt_idx" ON "CampaignV2"("tenantKey", "createdAt");

-- CreateIndex
CREATE INDEX "CampaignV2_planId_idx" ON "CampaignV2"("planId");

-- CreateIndex
CREATE INDEX "CampaignV2_missionId_idx" ON "CampaignV2"("missionId");

-- CreateIndex
CREATE INDEX "CreativeCopy_campaignId_idx" ON "CreativeCopy"("campaignId");

-- CreateIndex
CREATE INDEX "CreativeCopy_tenantKey_createdAt_idx" ON "CreativeCopy"("tenantKey", "createdAt");

-- CreateIndex
CREATE INDEX "CreativeAsset_campaignId_idx" ON "CreativeAsset"("campaignId");

-- CreateIndex
CREATE INDEX "CampaignScheduleItem_campaignId_idx" ON "CampaignScheduleItem"("campaignId");

-- CreateIndex
CREATE INDEX "CampaignScheduleItem_tenantKey_scheduledAt_idx" ON "CampaignScheduleItem"("tenantKey", "scheduledAt");

-- CreateIndex
CREATE INDEX "Offer_campaignId_idx" ON "Offer"("campaignId");

-- CreateIndex
CREATE INDEX "ChannelDeployment_campaignId_idx" ON "ChannelDeployment"("campaignId");

-- CreateIndex
CREATE INDEX "CampaignReport_tenantKey_createdAt_idx" ON "CampaignReport"("tenantKey", "createdAt");

-- CreateIndex
CREATE INDEX "CampaignReport_campaignId_idx" ON "CampaignReport"("campaignId");

-- CreateIndex
CREATE INDEX "CampaignReport_missionId_idx" ON "CampaignReport"("missionId");

-- CreateIndex
CREATE INDEX "LlmCache_expiresAt_idx" ON "LlmCache"("expiresAt");

-- CreateIndex
CREATE INDEX "LlmCache_tenantKey_expiresAt_idx" ON "LlmCache"("tenantKey", "expiresAt");

-- CreateIndex
CREATE INDEX "LlmCache_tenantKey_lastAccessedAt_idx" ON "LlmCache"("tenantKey", "lastAccessedAt");

-- CreateIndex
CREATE UNIQUE INDEX "LlmCache_tenantKey_purpose_promptHash_provider_model_key" ON "LlmCache"("tenantKey", "purpose", "promptHash", "provider", "model");

-- CreateIndex
CREATE INDEX "LlmUsageDaily_tenantKey_day_idx" ON "LlmUsageDaily"("tenantKey", "day");

-- CreateIndex
CREATE INDEX "LlmUsageDaily_day_idx" ON "LlmUsageDaily"("day");

-- CreateIndex
CREATE UNIQUE INDEX "LlmUsageDaily_tenantKey_purpose_provider_model_day_key" ON "LlmUsageDaily"("tenantKey", "purpose", "provider", "model", "day");

-- CreateIndex
CREATE INDEX "IntentRequest_missionId_status_idx" ON "IntentRequest"("missionId", "status");

-- CreateIndex
CREATE INDEX "IntentRequest_missionId_createdAt_idx" ON "IntentRequest"("missionId", "createdAt");

-- CreateIndex
CREATE INDEX "MissionEvent_missionId_createdAt_idx" ON "MissionEvent"("missionId", "createdAt");

-- CreateIndex
CREATE INDEX "MissionEvent_intentId_createdAt_idx" ON "MissionEvent"("intentId", "createdAt");

-- CreateIndex
CREATE INDEX "MissionRun_missionId_idx" ON "MissionRun"("missionId");

-- CreateIndex
CREATE INDEX "MissionRun_status_idx" ON "MissionRun"("status");

-- CreateIndex
CREATE INDEX "MissionRun_createdAt_idx" ON "MissionRun"("createdAt");

-- CreateIndex
CREATE INDEX "MissionPipeline_tenantId_status_idx" ON "MissionPipeline"("tenantId", "status");

-- CreateIndex
CREATE INDEX "MissionPipeline_createdAt_idx" ON "MissionPipeline"("createdAt");

-- CreateIndex
CREATE INDEX "MissionPipeline_status_runState_idx" ON "MissionPipeline"("status", "runState");

-- CreateIndex
CREATE INDEX "MissionPipelineStep_missionId_orderIndex_idx" ON "MissionPipelineStep"("missionId", "orderIndex");

-- CreateIndex
CREATE INDEX "StoreOffer_storeId_idx" ON "StoreOffer"("storeId");

-- CreateIndex
CREATE INDEX "StoreOffer_isActive_idx" ON "StoreOffer"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "StoreOffer_storeId_slug_key" ON "StoreOffer"("storeId", "slug");

-- CreateIndex
CREATE INDEX "IntentSignal_storeId_idx" ON "IntentSignal"("storeId");

-- CreateIndex
CREATE INDEX "IntentSignal_offerId_idx" ON "IntentSignal"("offerId");

-- CreateIndex
CREATE INDEX "IntentSignal_type_createdAt_idx" ON "IntentSignal"("type", "createdAt");

-- CreateIndex
CREATE INDEX "IntentOpportunity_storeId_idx" ON "IntentOpportunity"("storeId");

-- CreateIndex
CREATE INDEX "IntentOpportunity_storeId_status_idx" ON "IntentOpportunity"("storeId", "status");

-- CreateIndex
CREATE INDEX "IntentOpportunity_storeId_source_idx" ON "IntentOpportunity"("storeId", "source");

-- CreateIndex
CREATE INDEX "IntentOpportunity_createdAt_idx" ON "IntentOpportunity"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "OpportunityInferenceRun_storeId_key" ON "OpportunityInferenceRun"("storeId");

-- CreateIndex
CREATE INDEX "OpportunityInferenceRun_lastRunAt_idx" ON "OpportunityInferenceRun"("lastRunAt");

-- CreateIndex
CREATE INDEX "IntentNode_draftStoreId_idx" ON "IntentNode"("draftStoreId");

-- CreateIndex
CREATE INDEX "IntentNode_storeId_idx" ON "IntentNode"("storeId");

-- CreateIndex
CREATE INDEX "IntentNode_intentKey_idx" ON "IntentNode"("intentKey");

-- CreateIndex
CREATE INDEX "IntentNode_draftStoreId_intentKey_idx" ON "IntentNode"("draftStoreId", "intentKey");

-- CreateIndex
CREATE INDEX "IntentNode_storeId_intentKey_idx" ON "IntentNode"("storeId", "intentKey");

-- CreateIndex
CREATE INDEX "IntentEdge_fromId_idx" ON "IntentEdge"("fromId");

-- CreateIndex
CREATE INDEX "IntentEdge_toId_idx" ON "IntentEdge"("toId");

-- CreateIndex
CREATE UNIQUE INDEX "IntentEdge_fromId_toId_key" ON "IntentEdge"("fromId", "toId");

-- CreateIndex
CREATE INDEX "IntentGraphSignal_intentNodeId_idx" ON "IntentGraphSignal"("intentNodeId");

-- CreateIndex
CREATE INDEX "IntentGraphSignal_signalType_idx" ON "IntentGraphSignal"("signalType");

-- CreateIndex
CREATE INDEX "OfferIntentMatch_intentNodeId_idx" ON "OfferIntentMatch"("intentNodeId");

-- CreateIndex
CREATE INDEX "OfferIntentMatch_draftStoreId_idx" ON "OfferIntentMatch"("draftStoreId");

-- CreateIndex
CREATE INDEX "OfferIntentMatch_storeId_idx" ON "OfferIntentMatch"("storeId");

-- CreateIndex
CREATE INDEX "OfferIntentMatch_offerType_offerRef_idx" ON "OfferIntentMatch"("offerType", "offerRef");

-- CreateIndex
CREATE INDEX "StoreActionSuggestion_draftStoreId_idx" ON "StoreActionSuggestion"("draftStoreId");

-- CreateIndex
CREATE INDEX "StoreActionSuggestion_storeId_idx" ON "StoreActionSuggestion"("storeId");

-- CreateIndex
CREATE INDEX "StoreActionSuggestion_status_idx" ON "StoreActionSuggestion"("status");

-- CreateIndex
CREATE INDEX "StoreActionSuggestion_draftStoreId_status_idx" ON "StoreActionSuggestion"("draftStoreId", "status");

-- CreateIndex
CREATE INDEX "StoreActionSuggestion_storeId_status_idx" ON "StoreActionSuggestion"("storeId", "status");

-- CreateIndex
CREATE INDEX "StoreActionSuggestion_cooldownUntil_idx" ON "StoreActionSuggestion"("cooldownUntil");

-- CreateIndex
CREATE INDEX "ActionOutcome_suggestionId_idx" ON "ActionOutcome"("suggestionId");

-- CreateIndex
CREATE INDEX "ActionOutcome_outcome_idx" ON "ActionOutcome"("outcome");

-- CreateIndex
CREATE INDEX "ActionOutcome_createdAt_idx" ON "ActionOutcome"("createdAt");

-- CreateIndex
CREATE INDEX "Promotion_storeId_idx" ON "Promotion"("storeId");

-- CreateIndex
CREATE INDEX "Promotion_status_idx" ON "Promotion"("status");

-- CreateIndex
CREATE INDEX "Promotion_startAt_endAt_idx" ON "Promotion"("startAt", "endAt");

-- CreateIndex
CREATE UNIQUE INDEX "PromotionSlot_slotKey_key" ON "PromotionSlot"("slotKey");

-- CreateIndex
CREATE INDEX "PromotionSlot_slotKey_idx" ON "PromotionSlot"("slotKey");

-- CreateIndex
CREATE INDEX "PromotionSlot_isActive_idx" ON "PromotionSlot"("isActive");

-- CreateIndex
CREATE INDEX "PromotionPlacement_promotionId_idx" ON "PromotionPlacement"("promotionId");

-- CreateIndex
CREATE INDEX "PromotionPlacement_slotId_idx" ON "PromotionPlacement"("slotId");

-- CreateIndex
CREATE INDEX "PromotionPlacement_storeId_idx" ON "PromotionPlacement"("storeId");

-- CreateIndex
CREATE INDEX "PromotionPlacement_slotId_storeId_idx" ON "PromotionPlacement"("slotId", "storeId");

-- CreateIndex
CREATE INDEX "PromotionPlacement_enabled_idx" ON "PromotionPlacement"("enabled");

-- CreateIndex
CREATE INDEX "Business_userId_idx" ON "Business"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "MissionTask_missionId_sourceMessageId_normalizedLabel_key" ON "MissionTask"("missionId", "sourceMessageId", "normalizedLabel");

-- CreateIndex
CREATE INDEX "OrchestratorTask_missionId_idx" ON "OrchestratorTask"("missionId");
