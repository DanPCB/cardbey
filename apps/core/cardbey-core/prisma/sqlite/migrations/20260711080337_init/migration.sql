/*
  Warnings:

  - You are about to drop the `PlatformConnection` table. If the table is not empty, all the data it contains will be lost.
  - You are about to alter the column `capabilities` on the `AccountProfile` table. The data in that column could be lost. The data in that column will be cast from `String` to `Json`.
  - You are about to alter the column `internalNotes` on the `AccountProfile` table. The data in that column could be lost. The data in that column will be cast from `String` to `Json`.
  - You are about to alter the column `languages` on the `AccountProfile` table. The data in that column could be lost. The data in that column will be cast from `String` to `Json`.
  - You are about to alter the column `metadata` on the `AudioLibrary` table. The data in that column could be lost. The data in that column will be cast from `String` to `Json`.
  - You are about to alter the column `tags` on the `AudioLibrary` table. The data in that column could be lost. The data in that column will be cast from `String` to `Json`.
  - You are about to alter the column `tags` on the `BusinessLead` table. The data in that column could be lost. The data in that column will be cast from `String` to `Json`.
  - You are about to alter the column `categories` on the `Creator` table. The data in that column could be lost. The data in that column will be cast from `String` to `Json`.
  - You are about to alter the column `languages` on the `Creator` table. The data in that column could be lost. The data in that column will be cast from `String` to `Json`.
  - You are about to alter the column `evidenceJson` on the `CreatorClassification` table. The data in that column could be lost. The data in that column will be cast from `String` to `Json`.
  - You are about to alter the column `resultJson` on the `CreatorClassification` table. The data in that column could be lost. The data in that column will be cast from `String` to `Json`.
  - You are about to alter the column `creatorFeedback` on the `CreatorContent` table. The data in that column could be lost. The data in that column will be cast from `String` to `Json`.
  - You are about to alter the column `publishingDestinations` on the `CreatorContent` table. The data in that column could be lost. The data in that column will be cast from `String` to `Json`.
  - You are about to alter the column `destinationsJson` on the `CreatorPublishingDecision` table. The data in that column could be lost. The data in that column will be cast from `String` to `Json`.
  - You are about to alter the column `metadataJson` on the `CreatorPublishingEvent` table. The data in that column could be lost. The data in that column will be cast from `String` to `Json`.
  - You are about to alter the column `auditSummary` on the `GrowthBatch` table. The data in that column could be lost. The data in that column will be cast from `String` to `Json`.
  - You are about to alter the column `createdStoreIds` on the `GrowthBatch` table. The data in that column could be lost. The data in that column will be cast from `String` to `Json`.
  - You are about to alter the column `errorSummary` on the `GrowthBatch` table. The data in that column could be lost. The data in that column will be cast from `String` to `Json`.
  - You are about to alter the column `reviewQueueIds` on the `GrowthBatch` table. The data in that column could be lost. The data in that column will be cast from `String` to `Json`.
  - You are about to alter the column `sourceLeadIds` on the `GrowthBatch` table. The data in that column could be lost. The data in that column will be cast from `String` to `Json`.
  - You are about to alter the column `metadata` on the `LeadActivity` table. The data in that column could be lost. The data in that column will be cast from `String` to `Json`.
  - You are about to drop the column `count` on the `LoyaltyStamp` table. All the data in the column will be lost.
  - You are about to drop the column `createdAt` on the `LoyaltyStamp` table. All the data in the column will be lost.
  - You are about to drop the column `customerId` on the `LoyaltyStamp` table. All the data in the column will be lost.
  - You are about to drop the column `programId` on the `LoyaltyStamp` table. All the data in the column will be lost.
  - You are about to drop the column `rewarded` on the `LoyaltyStamp` table. All the data in the column will be lost.
  - You are about to drop the column `storeId` on the `LoyaltyStamp` table. All the data in the column will be lost.
  - You are about to drop the column `tenantId` on the `LoyaltyStamp` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `LoyaltyStamp` table. All the data in the column will be lost.
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
  - You are about to alter the column `completedSteps` on the `OnboardingProgress` table. The data in that column could be lost. The data in that column will be cast from `String` to `Json`.
  - You are about to alter the column `targetLeadIds` on the `OutreachCampaign` table. The data in that column could be lost. The data in that column will be cast from `String` to `Json`.
  - You are about to alter the column `adjustmentHistory` on the `PatternWeight` table. The data in that column could be lost. The data in that column will be cast from `String` to `Json`.
  - You are about to alter the column `metadata` on the `PilEvent` table. The data in that column could be lost. The data in that column will be cast from `String` to `Json`.
  - You are about to alter the column `serviceCatalog` on the `Product` table. The data in that column could be lost. The data in that column will be cast from `String` to `Json`.
  - You are about to alter the column `metadata` on the `QuoteRequest` table. The data in that column could be lost. The data in that column will be cast from `String` to `Json`.
  - You are about to alter the column `uploadedFiles` on the `QuoteRequest` table. The data in that column could be lost. The data in that column will be cast from `String` to `Json`.
  - You are about to alter the column `metadata` on the `SelfHealingProposal` table. The data in that column could be lost. The data in that column will be cast from `String` to `Json`.
  - You are about to alter the column `requiresConfirmation` on the `SelfHealingProposal` table. The data in that column could be lost. The data in that column will be cast from `Int` to `Boolean`.
  - You are about to alter the column `suggestedFix` on the `SelfHealingProposal` table. The data in that column could be lost. The data in that column will be cast from `String` to `Json`.
  - You are about to alter the column `metadataJson` on the `StoreActivityEvent` table. The data in that column could be lost. The data in that column will be cast from `String` to `Json`.
  - You are about to alter the column `metadata` on the `StoreLeadActivity` table. The data in that column could be lost. The data in that column will be cast from `String` to `Json`.
  - You are about to alter the column `targetLeadIds` on the `StoreOutreachCampaign` table. The data in that column could be lost. The data in that column will be cast from `String` to `Json`.
  - You are about to alter the column `metadata` on the `TelemetryNavigation` table. The data in that column could be lost. The data in that column will be cast from `String` to `Json`.
  - You are about to alter the column `nextStateJson` on the `UserAccountEvent` table. The data in that column could be lost. The data in that column will be cast from `String` to `Json`.
  - You are about to alter the column `previousStateJson` on the `UserAccountEvent` table. The data in that column could be lost. The data in that column will be cast from `String` to `Json`.
  - You are about to alter the column `abandonedTasks` on the `UserMemory` table. The data in that column could be lost. The data in that column will be cast from `String` to `Json`.
  - You are about to alter the column `actionHistory` on the `UserMemory` table. The data in that column could be lost. The data in that column will be cast from `String` to `Json`.
  - You are about to alter the column `completedTasks` on the `UserMemory` table. The data in that column could be lost. The data in that column will be cast from `String` to `Json`.
  - You are about to alter the column `artifacts` on the `conversation_messages` table. The data in that column could be lost. The data in that column will be cast from `String` to `Json`.
  - You are about to alter the column `content_json` on the `conversation_messages` table. The data in that column could be lost. The data in that column will be cast from `String` to `Json`.
  - You are about to alter the column `tool_calls` on the `conversation_messages` table. The data in that column could be lost. The data in that column will be cast from `String` to `Json`.
  - You are about to alter the column `payload_json` on the `conversation_pending_actions` table. The data in that column could be lost. The data in that column will be cast from `String` to `Json`.
  - You are about to alter the column `metadata` on the `conversation_sessions` table. The data in that column could be lost. The data in that column will be cast from `String` to `Json`.
  - You are about to alter the column `metadata` on the `learning_behavior_patterns` table. The data in that column could be lost. The data in that column will be cast from `String` to `Json`.
  - You are about to alter the column `metadata` on the `learning_user_feedback` table. The data in that column could be lost. The data in that column will be cast from `String` to `Json`.
  - You are about to alter the column `confidence_calibration` on the `learning_user_profiles` table. The data in that column could be lost. The data in that column will be cast from `String` to `Json`.
  - You are about to alter the column `frequently_used_tools` on the `learning_user_profiles` table. The data in that column could be lost. The data in that column will be cast from `String` to `Json`.
  - You are about to alter the column `learning_enabled` on the `learning_user_profiles` table. The data in that column could be lost. The data in that column will be cast from `Int` to `Boolean`.
  - You are about to alter the column `preferred_workflows` on the `learning_user_profiles` table. The data in that column could be lost. The data in that column will be cast from `String` to `Json`.
  - You are about to alter the column `skipped_steps` on the `learning_user_profiles` table. The data in that column could be lost. The data in that column will be cast from `String` to `Json`.
  - You are about to alter the column `active` on the `performer_session_contexts` table. The data in that column could be lost. The data in that column will be cast from `Int` to `Boolean`.
  - You are about to alter the column `customThresholds` on the `user_signal_preferences` table. The data in that column could be lost. The data in that column will be cast from `String` to `Json`.
  - You are about to alter the column `disabledSignals` on the `user_signal_preferences` table. The data in that column could be lost. The data in that column will be cast from `String` to `Json`.
  - You are about to alter the column `enabledSignals` on the `user_signal_preferences` table. The data in that column could be lost. The data in that column will be cast from `String` to `Json`.
  - Added the required column `docId` to the `LoyaltyStamp` table without a default value. This is not possible if the table is not empty.
  - Added the required column `visitorId` to the `LoyaltyStamp` table without a default value. This is not possible if the table is not empty.
  - Added the required column `intentType` to the `MissionRun` table without a default value. This is not possible if the table is not empty.
  - Made the column `userId` on table `MissionRun` required. This step will fail if there are existing NULL values in that column.
  - Made the column `customThresholds` on table `user_signal_preferences` required. This step will fail if there are existing NULL values in that column.
  - Made the column `disabledSignals` on table `user_signal_preferences` required. This step will fail if there are existing NULL values in that column.
  - Made the column `enabledSignals` on table `user_signal_preferences` required. This step will fail if there are existing NULL values in that column.

*/
-- DropIndex
DROP INDEX "ExecutiveLead_businessSeedId_idx";

-- DropIndex
DROP INDEX "PlatformConnection_userId_status_idx";

-- DropIndex
DROP INDEX "PlatformConnection_userId_platformId_idx";

-- DropIndex
DROP INDEX "PlatformConnection_userId_platformId_key";

-- AlterTable
ALTER TABLE "Device" ADD COLUMN "lastPlaybackReportAt" DATETIME;
ALTER TABLE "Device" ADD COLUMN "playbackReportIsPlaying" BOOLEAN;
ALTER TABLE "Device" ADD COLUMN "playbackReportState" TEXT;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "PlatformConnection";
PRAGMA foreign_keys=on;

-- CreateTable
CREATE TABLE "TelemetryProbe" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tag" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "missionId" TEXT,
    "payload" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "PersonalMedia" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PersonalMedia_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ContentLibraryAsset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "storeId" TEXT,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "category" TEXT,
    "tags" JSONB,
    "license" TEXT,
    "metadata" JSONB,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ContentLibraryAsset_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Business" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MerchantDesign" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "storeId" TEXT NOT NULL,
    "name" TEXT,
    "specJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MerchantDesign_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Business" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DevSystemProposal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantKey" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdByEmail" TEXT,
    "type" TEXT NOT NULL DEFAULT 'code_task_proposal',
    "title" TEXT NOT NULL,
    "objective" TEXT NOT NULL,
    "engine" TEXT,
    "mode" TEXT NOT NULL DEFAULT 'proposal_only',
    "status" TEXT NOT NULL DEFAULT 'guarded',
    "normalizedTaskJson" JSONB NOT NULL,
    "guardJson" JSONB NOT NULL,
    "notesJson" JSONB,
    "reviewedByUserId" TEXT,
    "reviewedByEmail" TEXT,
    "reviewedAt" DATETIME,
    "reviewDecisionReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "DevSystemExecutionPreview" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantKey" TEXT,
    "proposalId" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "createdByEmail" TEXT,
    "status" TEXT NOT NULL DEFAULT 'dry_run_generated',
    "engine" TEXT,
    "mode" TEXT NOT NULL DEFAULT 'dry_run_only',
    "executionIntentJson" JSONB NOT NULL,
    "normalizedTaskJson" JSONB NOT NULL,
    "authorizationJson" JSONB NOT NULL,
    "resultPreviewJson" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "SecurityEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantKey" TEXT,
    "actorUserId" TEXT,
    "actorEmail" TEXT,
    "type" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'info',
    "source" TEXT NOT NULL,
    "route" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "detailsJson" JSONB,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "LoyaltyProgramStamp" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "rewarded" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LoyaltyProgramStamp_programId_fkey" FOREIGN KEY ("programId") REFERENCES "LoyaltyProgram" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MissionBlackboard" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "missionId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" TEXT NOT NULL DEFAULT '{}',
    "agentId" TEXT,
    "correlationId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MissionBlackboard_missionId_fkey" FOREIGN KEY ("missionId") REFERENCES "Mission" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

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

-- CreateTable
CREATE TABLE "McpToken" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "label" TEXT NOT NULL DEFAULT 'MCP Token',
    "revoked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" DATETIME
);

-- CreateTable
CREATE TABLE "UserIdentifier" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "hashVersion" TEXT NOT NULL DEFAULT 'v1',
    "source" TEXT NOT NULL DEFAULT 'email',
    "verifiedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "UserIdentifier_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ContactSyncConsent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'granted',
    "policyVersion" TEXT NOT NULL,
    "grantedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ContactSyncSource" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "consentId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "deviceFingerprint" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "lastSyncAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ContactSyncSource_consentId_fkey" FOREIGN KEY ("consentId") REFERENCES "ContactSyncConsent" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ContactSyncJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sourceId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'started',
    "counts" JSONB,
    "errorCode" TEXT,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" DATETIME,
    CONSTRAINT "ContactSyncJob_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "ContactSyncSource" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ContactIdentifier" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sourceId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "hashVersion" TEXT NOT NULL DEFAULT 'v1',
    "firstSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ContactIdentifier_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "ContactSyncSource" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ContactMatch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sourceId" TEXT NOT NULL,
    "matchedUserId" TEXT NOT NULL,
    "matchBasis" TEXT NOT NULL,
    "confidence" REAL NOT NULL DEFAULT 1.0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ContactMatch_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "ContactSyncSource" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ContactSuggestion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "matchedUserId" TEXT,
    "rankScore" REAL NOT NULL DEFAULT 0,
    "reasonCode" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME
);

-- CreateTable
CREATE TABLE "Card" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "designJson" JSONB NOT NULL,
    "agentPersonality" TEXT NOT NULL,
    "knowledgeBase" JSONB NOT NULL,
    "capabilities" TEXT NOT NULL,
    "autoApprove" BOOLEAN NOT NULL DEFAULT true,
    "liveUrl" TEXT NOT NULL,
    "qrCodeUrl" TEXT,
    "sizeW" REAL NOT NULL,
    "sizeH" REAL NOT NULL,
    "sizeUnit" TEXT NOT NULL,
    "sizeDpi" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Card_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SmartDocument" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "businessId" TEXT,
    "docType" TEXT NOT NULL,
    "subtype" TEXT,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "phase" TEXT NOT NULL DEFAULT 'pre',
    "designJson" TEXT,
    "renderedUrl" TEXT,
    "printUrl" TEXT,
    "qrCodeUrl" TEXT,
    "liveUrl" TEXT,
    "sizeW" REAL,
    "sizeH" REAL,
    "sizeUnit" TEXT DEFAULT 'mm',
    "sizeDpi" INTEGER DEFAULT 300,
    "agentPersonality" TEXT,
    "knowledgeBase" TEXT,
    "capabilities" TEXT NOT NULL DEFAULT '[]',
    "autoApprove" BOOLEAN NOT NULL DEFAULT true,
    "phaseConfig" TEXT,
    "expiresAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SmartDocument_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SmartDocument_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DocVisitor" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "docId" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "name" TEXT,
    "platformVisitorId" TEXT,
    "firstSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" DATETIME NOT NULL,
    CONSTRAINT "DocVisitor_docId_fkey" FOREIGN KEY ("docId") REFERENCES "SmartDocument" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DocConversation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "docId" TEXT NOT NULL,
    "visitorId" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'web',
    "messages" TEXT NOT NULL DEFAULT '[]',
    "outcome" TEXT,
    "intent" TEXT,
    "sentiment" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DocConversation_docId_fkey" FOREIGN KEY ("docId") REFERENCES "SmartDocument" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DocConversation_visitorId_fkey" FOREIGN KEY ("visitorId") REFERENCES "DocVisitor" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DocScheduledMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "docId" TEXT NOT NULL,
    "sendAt" DATETIME NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'web',
    "payload" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "sentAt" DATETIME,
    "error" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DocScheduledMessage_docId_fkey" FOREIGN KEY ("docId") REFERENCES "SmartDocument" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DocumentPromoRedemption" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "docId" TEXT NOT NULL,
    "visitorId" TEXT NOT NULL,
    "redeemedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "discountApplied" TEXT,
    CONSTRAINT "DocumentPromoRedemption_docId_fkey" FOREIGN KEY ("docId") REFERENCES "SmartDocument" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DocumentPromoRedemption_visitorId_fkey" FOREIGN KEY ("visitorId") REFERENCES "DocVisitor" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EventRsvp" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "docId" TEXT NOT NULL,
    "visitorId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "rsvpAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EventRsvp_docId_fkey" FOREIGN KEY ("docId") REFERENCES "SmartDocument" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "EventRsvp_visitorId_fkey" FOREIGN KEY ("visitorId") REFERENCES "DocVisitor" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DocCheckIn" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "docId" TEXT NOT NULL,
    "visitorId" TEXT NOT NULL,
    "checkedInAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,
    CONSTRAINT "DocCheckIn_docId_fkey" FOREIGN KEY ("docId") REFERENCES "SmartDocument" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DocCheckIn_visitorId_fkey" FOREIGN KEY ("visitorId") REFERENCES "DocVisitor" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DocSignature" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "docId" TEXT NOT NULL,
    "visitorId" TEXT NOT NULL,
    "signedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "signatureUrl" TEXT,
    "ipAddress" TEXT,
    CONSTRAINT "DocSignature_docId_fkey" FOREIGN KEY ("docId") REFERENCES "SmartDocument" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DocSignature_visitorId_fkey" FOREIGN KEY ("visitorId") REFERENCES "DocVisitor" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AccountProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "capabilities" JSONB NOT NULL DEFAULT [],
    "primaryCapability" TEXT,
    "accountStatus" TEXT NOT NULL DEFAULT 'ACTIVE',
    "creatorPublishingRestricted" BOOLEAN NOT NULL DEFAULT false,
    "businessManagementRestricted" BOOLEAN NOT NULL DEFAULT false,
    "internalNotes" JSONB,
    "languages" JSONB,
    "lastActiveAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AccountProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_AccountProfile" ("accountStatus", "businessManagementRestricted", "capabilities", "createdAt", "creatorPublishingRestricted", "id", "internalNotes", "languages", "lastActiveAt", "primaryCapability", "updatedAt", "userId") SELECT "accountStatus", "businessManagementRestricted", "capabilities", "createdAt", "creatorPublishingRestricted", "id", "internalNotes", "languages", "lastActiveAt", "primaryCapability", "updatedAt", "userId" FROM "AccountProfile";
DROP TABLE "AccountProfile";
ALTER TABLE "new_AccountProfile" RENAME TO "AccountProfile";
CREATE UNIQUE INDEX "AccountProfile_userId_key" ON "AccountProfile"("userId");
CREATE INDEX "AccountProfile_accountStatus_idx" ON "AccountProfile"("accountStatus");
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
CREATE TABLE "new_AudioLibrary" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "externalId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "duration" INTEGER,
    "remoteUrl" TEXT,
    "storageUrl" TEXT,
    "storageKey" TEXT,
    "license" TEXT NOT NULL,
    "attribution" TEXT,
    "tags" JSONB,
    "metadata" JSONB,
    "storeId" TEXT,
    "uploadedBy" TEXT,
    "isSeeded" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_AudioLibrary" ("attribution", "createdAt", "description", "duration", "externalId", "id", "isSeeded", "license", "metadata", "remoteUrl", "source", "storageKey", "storageUrl", "storeId", "tags", "title", "updatedAt", "uploadedBy") SELECT "attribution", "createdAt", "description", "duration", "externalId", "id", "isSeeded", "license", "metadata", "remoteUrl", "source", "storageKey", "storageUrl", "storeId", "tags", "title", "updatedAt", "uploadedBy" FROM "AudioLibrary";
DROP TABLE "AudioLibrary";
ALTER TABLE "new_AudioLibrary" RENAME TO "AudioLibrary";
CREATE UNIQUE INDEX "AudioLibrary_externalId_key" ON "AudioLibrary"("externalId");
CREATE INDEX "AudioLibrary_source_idx" ON "AudioLibrary"("source");
CREATE INDEX "AudioLibrary_title_idx" ON "AudioLibrary"("title");
CREATE INDEX "AudioLibrary_storeId_idx" ON "AudioLibrary"("storeId");
CREATE INDEX "AudioLibrary_uploadedBy_idx" ON "AudioLibrary"("uploadedBy");
CREATE TABLE "new_Business" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "showOwnerProfile" BOOLEAN NOT NULL DEFAULT false,
    "translations" JSONB,
    "logo" TEXT,
    "region" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "tradingHours" JSONB,
    "address" TEXT,
    "addressLine2" TEXT,
    "suburb" TEXT,
    "city" TEXT,
    "state" TEXT,
    "postcode" TEXT,
    "country" TEXT,
    "formattedAddress" TEXT,
    "locationSource" TEXT,
    "locationConfidence" TEXT,
    "osmPlaceId" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "websiteUrl" TEXT,
    "mapUrl" TEXT,
    "lat" REAL,
    "lng" REAL,
    "primaryColor" TEXT,
    "secondaryColor" TEXT,
    "tagline" TEXT,
    "heroText" TEXT,
    "heroImageUrl" TEXT,
    "avatarImageUrl" TEXT,
    "publishedAt" DATETIME,
    "transactionMode" TEXT NOT NULL DEFAULT 'order',
    "catalogLabel" TEXT NOT NULL DEFAULT 'Products',
    "ctaLabel" TEXT NOT NULL DEFAULT 'Order now',
    "stylePreferences" JSONB,
    "storefrontSettings" JSONB,
    "socialLinks" JSONB,
    "brandTone" TEXT,
    "brandStyle" TEXT,
    "brandColors" TEXT,
    "provenance" TEXT DEFAULT 'owner',
    "claimStatus" TEXT,
    "captureCount" INTEGER NOT NULL DEFAULT 1,
    "capturedByUserId" TEXT,
    "isGuestDraft" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Business_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Business" ("address", "addressLine2", "avatarImageUrl", "brandColors", "brandStyle", "brandTone", "captureCount", "capturedByUserId", "city", "claimStatus", "country", "createdAt", "description", "email", "formattedAddress", "heroImageUrl", "heroText", "id", "isActive", "lat", "lng", "locationConfidence", "locationSource", "logo", "mapUrl", "name", "osmPlaceId", "phone", "postcode", "primaryColor", "provenance", "publishedAt", "region", "secondaryColor", "slug", "state", "storefrontSettings", "stylePreferences", "suburb", "tagline", "tradingHours", "translations", "type", "updatedAt", "userId", "websiteUrl") SELECT "address", "addressLine2", "avatarImageUrl", "brandColors", "brandStyle", "brandTone", "captureCount", "capturedByUserId", "city", "claimStatus", "country", "createdAt", "description", "email", "formattedAddress", "heroImageUrl", "heroText", "id", "isActive", "lat", "lng", "locationConfidence", "locationSource", "logo", "mapUrl", "name", "osmPlaceId", "phone", "postcode", "primaryColor", "provenance", "publishedAt", "region", "secondaryColor", "slug", "state", "storefrontSettings", "stylePreferences", "suburb", "tagline", "tradingHours", "translations", "type", "updatedAt", "userId", "websiteUrl" FROM "Business";
DROP TABLE "Business";
ALTER TABLE "new_Business" RENAME TO "Business";
CREATE UNIQUE INDEX "Business_slug_key" ON "Business"("slug");
CREATE INDEX "Business_userId_idx" ON "Business"("userId");
CREATE INDEX "Business_slug_idx" ON "Business"("slug");
CREATE TABLE "new_BusinessLead" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "spaceId" TEXT,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "source" TEXT,
    "status" TEXT NOT NULL DEFAULT 'new',
    "tags" JSONB,
    "lastContactedAt" DATETIME,
    "consentStatus" TEXT NOT NULL DEFAULT 'unknown',
    "notes" TEXT,
    "visitCount" INTEGER NOT NULL DEFAULT 0,
    "interestedAt" DATETIME,
    "followUpDueAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_BusinessLead" ("consentStatus", "createdAt", "email", "followUpDueAt", "id", "interestedAt", "lastContactedAt", "name", "notes", "ownerId", "phone", "source", "spaceId", "status", "storeId", "tags", "updatedAt", "visitCount") SELECT "consentStatus", "createdAt", "email", "followUpDueAt", "id", "interestedAt", "lastContactedAt", "name", "notes", "ownerId", "phone", "source", "spaceId", "status", "storeId", "tags", "updatedAt", "visitCount" FROM "BusinessLead";
DROP TABLE "BusinessLead";
ALTER TABLE "new_BusinessLead" RENAME TO "BusinessLead";
CREATE INDEX "BusinessLead_ownerId_idx" ON "BusinessLead"("ownerId");
CREATE INDEX "BusinessLead_storeId_idx" ON "BusinessLead"("storeId");
CREATE INDEX "BusinessLead_email_idx" ON "BusinessLead"("email");
CREATE INDEX "BusinessLead_status_idx" ON "BusinessLead"("status");
CREATE UNIQUE INDEX "BusinessLead_storeId_email_key" ON "BusinessLead"("storeId", "email");
CREATE TABLE "new_Creator" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "displayName" TEXT,
    "username" TEXT NOT NULL,
    "avatar" TEXT,
    "banner" TEXT,
    "bio" TEXT,
    "languages" JSONB,
    "country" TEXT,
    "categories" JSONB,
    "verifiedStatus" TEXT NOT NULL DEFAULT 'unverified',
    "joinedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "totalPublishedMinutes" REAL NOT NULL DEFAULT 0,
    "totalVideos" INTEGER NOT NULL DEFAULT 0,
    "totalArticles" INTEGER NOT NULL DEFAULT 0,
    "totalViews" INTEGER NOT NULL DEFAULT 0,
    "followers" INTEGER NOT NULL DEFAULT 0,
    "following" INTEGER NOT NULL DEFAULT 0,
    "creatorLevel" INTEGER NOT NULL DEFAULT 1,
    "creatorStatus" TEXT NOT NULL DEFAULT 'active',
    "qualificationProgress" REAL NOT NULL DEFAULT 0,
    "isQualified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Creator_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Creator" ("avatar", "banner", "bio", "categories", "country", "createdAt", "creatorLevel", "creatorStatus", "displayName", "followers", "following", "id", "isQualified", "joinedAt", "languages", "qualificationProgress", "totalArticles", "totalPublishedMinutes", "totalVideos", "totalViews", "updatedAt", "userId", "username", "verifiedStatus") SELECT "avatar", "banner", "bio", "categories", "country", "createdAt", "creatorLevel", "creatorStatus", "displayName", "followers", "following", "id", "isQualified", "joinedAt", "languages", "qualificationProgress", "totalArticles", "totalPublishedMinutes", "totalVideos", "totalViews", "updatedAt", "userId", "username", "verifiedStatus" FROM "Creator";
DROP TABLE "Creator";
ALTER TABLE "new_Creator" RENAME TO "Creator";
CREATE UNIQUE INDEX "Creator_userId_key" ON "Creator"("userId");
CREATE UNIQUE INDEX "Creator_username_key" ON "Creator"("username");
CREATE INDEX "Creator_username_idx" ON "Creator"("username");
CREATE INDEX "Creator_creatorStatus_idx" ON "Creator"("creatorStatus");
CREATE INDEX "Creator_joinedAt_idx" ON "Creator"("joinedAt");
CREATE TABLE "new_CreatorClassification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "contentId" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "modelVersion" TEXT NOT NULL,
    "policyVersion" TEXT NOT NULL,
    "resultJson" JSONB NOT NULL,
    "recommendation" TEXT NOT NULL,
    "confidence" REAL NOT NULL,
    "evidenceJson" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CreatorClassification_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "CreatorContent" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_CreatorClassification" ("confidence", "contentId", "createdAt", "creatorId", "evidenceJson", "id", "modelVersion", "policyVersion", "recommendation", "resultJson") SELECT "confidence", "contentId", "createdAt", "creatorId", "evidenceJson", "id", "modelVersion", "policyVersion", "recommendation", "resultJson" FROM "CreatorClassification";
DROP TABLE "CreatorClassification";
ALTER TABLE "new_CreatorClassification" RENAME TO "CreatorClassification";
CREATE INDEX "CreatorClassification_contentId_idx" ON "CreatorClassification"("contentId");
CREATE INDEX "CreatorClassification_creatorId_idx" ON "CreatorClassification"("creatorId");
CREATE INDEX "CreatorClassification_createdAt_idx" ON "CreatorClassification"("createdAt");
CREATE TABLE "new_CreatorContent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "creatorId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "language" TEXT,
    "durationSeconds" INTEGER,
    "publishedAt" DATETIME,
    "scheduledAt" DATETIME,
    "visibility" TEXT NOT NULL DEFAULT 'public',
    "thumbnail" TEXT,
    "mediaUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "publishingDestinations" JSONB,
    "creatorFeedback" JSONB,
    "views" INTEGER NOT NULL DEFAULT 0,
    "likes" INTEGER NOT NULL DEFAULT 0,
    "shares" INTEGER NOT NULL DEFAULT 0,
    "bookmarks" INTEGER NOT NULL DEFAULT 0,
    "runtimeMissionId" TEXT,
    "sourceType" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CreatorContent_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "Creator" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_CreatorContent" ("bookmarks", "createdAt", "creatorFeedback", "creatorId", "description", "durationSeconds", "id", "language", "likes", "mediaUrl", "publishedAt", "publishingDestinations", "runtimeMissionId", "scheduledAt", "shares", "sourceType", "status", "thumbnail", "title", "type", "updatedAt", "views", "visibility") SELECT "bookmarks", "createdAt", "creatorFeedback", "creatorId", "description", "durationSeconds", "id", "language", "likes", "mediaUrl", "publishedAt", "publishingDestinations", "runtimeMissionId", "scheduledAt", "shares", "sourceType", "status", "thumbnail", "title", "type", "updatedAt", "views", "visibility" FROM "CreatorContent";
DROP TABLE "CreatorContent";
ALTER TABLE "new_CreatorContent" RENAME TO "CreatorContent";
CREATE INDEX "CreatorContent_creatorId_idx" ON "CreatorContent"("creatorId");
CREATE INDEX "CreatorContent_status_idx" ON "CreatorContent"("status");
CREATE INDEX "CreatorContent_type_idx" ON "CreatorContent"("type");
CREATE INDEX "CreatorContent_publishedAt_idx" ON "CreatorContent"("publishedAt");
CREATE INDEX "CreatorContent_scheduledAt_idx" ON "CreatorContent"("scheduledAt");
CREATE TABLE "new_CreatorPublishingDecision" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "contentId" TEXT NOT NULL,
    "reviewerUserId" TEXT,
    "action" TEXT NOT NULL,
    "reasonCode" TEXT,
    "creatorFeedback" TEXT,
    "internalNote" TEXT,
    "destinationsJson" JSONB,
    "classificationId" TEXT,
    "aiRecommendation" TEXT,
    "disagreementType" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CreatorPublishingDecision_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "CreatorContent" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_CreatorPublishingDecision" ("action", "aiRecommendation", "classificationId", "contentId", "createdAt", "creatorFeedback", "destinationsJson", "disagreementType", "id", "internalNote", "reasonCode", "reviewerUserId") SELECT "action", "aiRecommendation", "classificationId", "contentId", "createdAt", "creatorFeedback", "destinationsJson", "disagreementType", "id", "internalNote", "reasonCode", "reviewerUserId" FROM "CreatorPublishingDecision";
DROP TABLE "CreatorPublishingDecision";
ALTER TABLE "new_CreatorPublishingDecision" RENAME TO "CreatorPublishingDecision";
CREATE INDEX "CreatorPublishingDecision_contentId_idx" ON "CreatorPublishingDecision"("contentId");
CREATE INDEX "CreatorPublishingDecision_reviewerUserId_idx" ON "CreatorPublishingDecision"("reviewerUserId");
CREATE INDEX "CreatorPublishingDecision_createdAt_idx" ON "CreatorPublishingDecision"("createdAt");
CREATE TABLE "new_CreatorPublishingEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "contentId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT,
    "actorType" TEXT NOT NULL,
    "actorId" TEXT,
    "metadataJson" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CreatorPublishingEvent_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "CreatorContent" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_CreatorPublishingEvent" ("actorId", "actorType", "contentId", "createdAt", "eventType", "fromStatus", "id", "metadataJson", "toStatus") SELECT "actorId", "actorType", "contentId", "createdAt", "eventType", "fromStatus", "id", "metadataJson", "toStatus" FROM "CreatorPublishingEvent";
DROP TABLE "CreatorPublishingEvent";
ALTER TABLE "new_CreatorPublishingEvent" RENAME TO "CreatorPublishingEvent";
CREATE INDEX "CreatorPublishingEvent_contentId_idx" ON "CreatorPublishingEvent"("contentId");
CREATE INDEX "CreatorPublishingEvent_eventType_idx" ON "CreatorPublishingEvent"("eventType");
CREATE INDEX "CreatorPublishingEvent_createdAt_idx" ON "CreatorPublishingEvent"("createdAt");
CREATE TABLE "new_DraftStore" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "mode" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "generationRunId" TEXT,
    "input" JSONB NOT NULL,
    "preview" JSONB,
    "publishSnapshot" JSONB,
    "publishSnapshotVersion" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "errorCode" TEXT,
    "recommendedAction" TEXT,
    "committedAt" DATETIME,
    "committedStoreId" TEXT,
    "committedUserId" TEXT,
    "ownerUserId" TEXT,
    "guestSessionId" TEXT,
    "ipHash" TEXT,
    "userAgent" TEXT,
    "brandTone" TEXT,
    "brandStyle" TEXT,
    "brandColors" TEXT,
    "unclaimedStoreId" TEXT,
    "transferredAt" DATETIME,
    "phone" TEXT,
    "email" TEXT,
    "websiteUrl" TEXT,
    "address" TEXT,
    "addressLine2" TEXT,
    "suburb" TEXT,
    "city" TEXT,
    "state" TEXT,
    "postcode" TEXT,
    "country" TEXT,
    "formattedAddress" TEXT,
    "locationSource" TEXT,
    "locationConfidence" TEXT,
    "osmPlaceId" TEXT,
    "mapUrl" TEXT,
    "lat" REAL,
    "lng" REAL,
    CONSTRAINT "DraftStore_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_DraftStore" ("address", "addressLine2", "brandColors", "brandStyle", "brandTone", "city", "committedAt", "committedStoreId", "committedUserId", "country", "createdAt", "email", "error", "errorCode", "expiresAt", "formattedAddress", "generationRunId", "guestSessionId", "id", "input", "ipHash", "lat", "lng", "locationConfidence", "locationSource", "mapUrl", "mode", "osmPlaceId", "ownerUserId", "phone", "postcode", "preview", "recommendedAction", "state", "status", "suburb", "transferredAt", "unclaimedStoreId", "updatedAt", "userAgent", "websiteUrl") SELECT "address", "addressLine2", "brandColors", "brandStyle", "brandTone", "city", "committedAt", "committedStoreId", "committedUserId", "country", "createdAt", "email", "error", "errorCode", "expiresAt", "formattedAddress", "generationRunId", "guestSessionId", "id", "input", "ipHash", "lat", "lng", "locationConfidence", "locationSource", "mapUrl", "mode", "osmPlaceId", "ownerUserId", "phone", "postcode", "preview", "recommendedAction", "state", "status", "suburb", "transferredAt", "unclaimedStoreId", "updatedAt", "userAgent", "websiteUrl" FROM "DraftStore";
DROP TABLE "DraftStore";
ALTER TABLE "new_DraftStore" RENAME TO "DraftStore";
CREATE UNIQUE INDEX "DraftStore_generationRunId_key" ON "DraftStore"("generationRunId");
CREATE INDEX "DraftStore_expiresAt_idx" ON "DraftStore"("expiresAt");
CREATE INDEX "DraftStore_unclaimedStoreId_idx" ON "DraftStore"("unclaimedStoreId");
CREATE INDEX "DraftStore_status_idx" ON "DraftStore"("status");
CREATE INDEX "DraftStore_createdAt_idx" ON "DraftStore"("createdAt");
CREATE INDEX "DraftStore_updatedAt_idx" ON "DraftStore"("updatedAt");
CREATE INDEX "DraftStore_committedStoreId_idx" ON "DraftStore"("committedStoreId");
CREATE INDEX "DraftStore_committedUserId_idx" ON "DraftStore"("committedUserId");
CREATE INDEX "DraftStore_ownerUserId_idx" ON "DraftStore"("ownerUserId");
CREATE INDEX "DraftStore_guestSessionId_idx" ON "DraftStore"("guestSessionId");
CREATE TABLE "new_GrowthBatch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "missionType" TEXT NOT NULL DEFAULT 'growth_acquisition_batch',
    "source" TEXT NOT NULL DEFAULT 'executive_overview',
    "mode" TEXT NOT NULL DEFAULT 'governed_batch',
    "region" TEXT,
    "category" TEXT,
    "quantityRequested" INTEGER NOT NULL,
    "quantityCreated" INTEGER NOT NULL DEFAULT 0,
    "autoCreateMode" TEXT NOT NULL DEFAULT 'draft_only',
    "requireReview" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "requestedBy" TEXT,
    "sourceLeadIds" JSONB,
    "createdStoreIds" JSONB,
    "reviewQueueIds" JSONB,
    "auditSummary" JSONB,
    "errorSummary" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME
);
INSERT INTO "new_GrowthBatch" ("auditSummary", "autoCreateMode", "category", "completedAt", "createdAt", "createdStoreIds", "errorSummary", "id", "missionType", "mode", "name", "quantityCreated", "quantityRequested", "region", "requestedBy", "requireReview", "reviewQueueIds", "source", "sourceLeadIds", "status") SELECT "auditSummary", "autoCreateMode", "category", "completedAt", "createdAt", "createdStoreIds", "errorSummary", "id", "missionType", "mode", "name", "quantityCreated", "quantityRequested", "region", "requestedBy", "requireReview", "reviewQueueIds", "source", "sourceLeadIds", "status" FROM "GrowthBatch";
DROP TABLE "GrowthBatch";
ALTER TABLE "new_GrowthBatch" RENAME TO "GrowthBatch";
CREATE INDEX "GrowthBatch_status_idx" ON "GrowthBatch"("status");
CREATE INDEX "GrowthBatch_requestedBy_idx" ON "GrowthBatch"("requestedBy");
CREATE INDEX "GrowthBatch_createdAt_idx" ON "GrowthBatch"("createdAt");
CREATE TABLE "new_LeadActivity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "leadId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "message" TEXT,
    "metadata" JSONB,
    "createdBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LeadActivity_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "ExecutiveLead" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_LeadActivity" ("createdAt", "createdBy", "id", "leadId", "message", "metadata", "type") SELECT "createdAt", "createdBy", "id", "leadId", "message", "metadata", "type" FROM "LeadActivity";
DROP TABLE "LeadActivity";
ALTER TABLE "new_LeadActivity" RENAME TO "LeadActivity";
CREATE INDEX "LeadActivity_leadId_idx" ON "LeadActivity"("leadId");
CREATE INDEX "LeadActivity_type_idx" ON "LeadActivity"("type");
CREATE INDEX "LeadActivity_createdAt_idx" ON "LeadActivity"("createdAt");
CREATE TABLE "new_LoyaltyStamp" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "docId" TEXT NOT NULL,
    "visitorId" TEXT NOT NULL,
    "stampedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "redeemedAt" DATETIME,
    CONSTRAINT "LoyaltyStamp_docId_fkey" FOREIGN KEY ("docId") REFERENCES "SmartDocument" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LoyaltyStamp_visitorId_fkey" FOREIGN KEY ("visitorId") REFERENCES "DocVisitor" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_LoyaltyStamp" ("id") SELECT "id" FROM "LoyaltyStamp";
DROP TABLE "LoyaltyStamp";
ALTER TABLE "new_LoyaltyStamp" RENAME TO "LoyaltyStamp";
CREATE INDEX "LoyaltyStamp_docId_stampedAt_idx" ON "LoyaltyStamp"("docId", "stampedAt");
CREATE INDEX "LoyaltyStamp_visitorId_stampedAt_idx" ON "LoyaltyStamp"("visitorId", "stampedAt");
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
CREATE TABLE "new_OnboardingProgress" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "step" INTEGER NOT NULL DEFAULT 0,
    "total" INTEGER NOT NULL DEFAULT 5,
    "completedSteps" JSONB NOT NULL,
    "lastStepAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_OnboardingProgress" ("completedSteps", "createdAt", "id", "lastStepAt", "step", "total", "updatedAt", "userId") SELECT "completedSteps", "createdAt", "id", "lastStepAt", "step", "total", "updatedAt", "userId" FROM "OnboardingProgress";
DROP TABLE "OnboardingProgress";
ALTER TABLE "new_OnboardingProgress" RENAME TO "OnboardingProgress";
CREATE UNIQUE INDEX "OnboardingProgress_userId_key" ON "OnboardingProgress"("userId");
CREATE INDEX "OnboardingProgress_userId_idx" ON "OnboardingProgress"("userId");
CREATE TABLE "new_OutreachCampaign" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "templateBody" TEXT,
    "targetLeadIds" JSONB,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "openCount" INTEGER NOT NULL DEFAULT 0,
    "clickCount" INTEGER NOT NULL DEFAULT 0,
    "replyCount" INTEGER NOT NULL DEFAULT 0,
    "requestedBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME
);
INSERT INTO "new_OutreachCampaign" ("clickCount", "completedAt", "createdAt", "failedCount", "id", "name", "openCount", "replyCount", "requestedBy", "sentCount", "status", "targetLeadIds", "templateBody", "templateId") SELECT "clickCount", "completedAt", "createdAt", "failedCount", "id", "name", "openCount", "replyCount", "requestedBy", "sentCount", "status", "targetLeadIds", "templateBody", "templateId" FROM "OutreachCampaign";
DROP TABLE "OutreachCampaign";
ALTER TABLE "new_OutreachCampaign" RENAME TO "OutreachCampaign";
CREATE INDEX "OutreachCampaign_status_idx" ON "OutreachCampaign"("status");
CREATE INDEX "OutreachCampaign_createdAt_idx" ON "OutreachCampaign"("createdAt");
CREATE TABLE "new_PatternWeight" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "patternId" TEXT NOT NULL,
    "intent" TEXT NOT NULL,
    "matchedSkill" TEXT NOT NULL,
    "weight" REAL NOT NULL DEFAULT 1.0,
    "adjustmentHistory" JSONB NOT NULL,
    "lastAdjusted" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_PatternWeight" ("adjustmentHistory", "createdAt", "id", "intent", "lastAdjusted", "matchedSkill", "patternId", "updatedAt", "weight") SELECT "adjustmentHistory", "createdAt", "id", "intent", "lastAdjusted", "matchedSkill", "patternId", "updatedAt", "weight" FROM "PatternWeight";
DROP TABLE "PatternWeight";
ALTER TABLE "new_PatternWeight" RENAME TO "PatternWeight";
CREATE UNIQUE INDEX "PatternWeight_patternId_key" ON "PatternWeight"("patternId");
CREATE INDEX "PatternWeight_intent_idx" ON "PatternWeight"("intent");
CREATE INDEX "PatternWeight_matchedSkill_idx" ON "PatternWeight"("matchedSkill");
CREATE TABLE "new_PilEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sessionId" TEXT,
    "userId" TEXT,
    "entityType" TEXT,
    "entityId" TEXT,
    "storeId" TEXT,
    "metadata" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_PilEvent" ("createdAt", "entityId", "entityType", "id", "metadata", "sessionId", "storeId", "timestamp", "type", "userId") SELECT "createdAt", "entityId", "entityType", "id", "metadata", "sessionId", "storeId", "timestamp", "type", "userId" FROM "PilEvent";
DROP TABLE "PilEvent";
ALTER TABLE "new_PilEvent" RENAME TO "PilEvent";
CREATE INDEX "PilEvent_type_timestamp_idx" ON "PilEvent"("type", "timestamp");
CREATE INDEX "PilEvent_sessionId_idx" ON "PilEvent"("sessionId");
CREATE INDEX "PilEvent_userId_idx" ON "PilEvent"("userId");
CREATE INDEX "PilEvent_storeId_timestamp_idx" ON "PilEvent"("storeId", "timestamp");
CREATE INDEX "PilEvent_entityType_entityId_idx" ON "PilEvent"("entityType", "entityId");
CREATE TABLE "new_Product" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT,
    "description" TEXT,
    "translations" JSONB,
    "price" REAL,
    "currency" TEXT DEFAULT 'USD',
    "category" TEXT,
    "imageUrl" TEXT,
    "sku" TEXT,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "images" JSONB,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "likeCount" INTEGER NOT NULL DEFAULT 0,
    "hasSam3Cutout" BOOLEAN NOT NULL DEFAULT false,
    "cutoutPath" TEXT,
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "featuredAt" DATETIME,
    "itemType" TEXT,
    "bookingEnabled" BOOLEAN,
    "purchaseEnabled" BOOLEAN,
    "primaryAction" TEXT,
    "serviceCatalog" JSONB,
    "deletedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Product_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Product" ("bookingEnabled", "businessId", "category", "createdAt", "currency", "cutoutPath", "deletedAt", "description", "featuredAt", "hasSam3Cutout", "id", "imageUrl", "images", "isFeatured", "isPublished", "itemType", "likeCount", "name", "normalizedName", "price", "primaryAction", "purchaseEnabled", "serviceCatalog", "sku", "translations", "updatedAt", "viewCount") SELECT "bookingEnabled", "businessId", "category", "createdAt", "currency", "cutoutPath", "deletedAt", "description", "featuredAt", "hasSam3Cutout", "id", "imageUrl", "images", "isFeatured", "isPublished", "itemType", "likeCount", "name", "normalizedName", "price", "primaryAction", "purchaseEnabled", "serviceCatalog", "sku", "translations", "updatedAt", "viewCount" FROM "Product";
DROP TABLE "Product";
ALTER TABLE "new_Product" RENAME TO "Product";
CREATE INDEX "Product_businessId_idx" ON "Product"("businessId");
CREATE INDEX "Product_businessId_isPublished_idx" ON "Product"("businessId", "isPublished");
CREATE INDEX "Product_category_idx" ON "Product"("category");
CREATE INDEX "Product_deletedAt_idx" ON "Product"("deletedAt");
CREATE INDEX "Product_hasSam3Cutout_idx" ON "Product"("hasSam3Cutout");
CREATE UNIQUE INDEX "Product_businessId_normalizedName_key" ON "Product"("businessId", "normalizedName");
CREATE TABLE "new_QuoteRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "storeId" TEXT NOT NULL,
    "serviceId" TEXT,
    "customerId" TEXT,
    "customerName" TEXT NOT NULL,
    "customerEmail" TEXT NOT NULL,
    "customerPhone" TEXT,
    "description" TEXT NOT NULL,
    "address" TEXT,
    "preferredDate" TEXT,
    "uploadedFiles" JSONB,
    "approximateSize" TEXT,
    "budget" REAL,
    "quoteAmount" REAL,
    "quoteMessage" TEXT,
    "status" TEXT NOT NULL DEFAULT 'new',
    "missionId" TEXT,
    "metadata" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "QuoteRequest_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Business" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_QuoteRequest" ("address", "approximateSize", "budget", "createdAt", "customerEmail", "customerId", "customerName", "customerPhone", "description", "id", "metadata", "missionId", "preferredDate", "quoteAmount", "quoteMessage", "serviceId", "status", "storeId", "updatedAt", "uploadedFiles") SELECT "address", "approximateSize", "budget", "createdAt", "customerEmail", "customerId", "customerName", "customerPhone", "description", "id", "metadata", "missionId", "preferredDate", "quoteAmount", "quoteMessage", "serviceId", "status", "storeId", "updatedAt", "uploadedFiles" FROM "QuoteRequest";
DROP TABLE "QuoteRequest";
ALTER TABLE "new_QuoteRequest" RENAME TO "QuoteRequest";
CREATE INDEX "QuoteRequest_storeId_idx" ON "QuoteRequest"("storeId");
CREATE INDEX "QuoteRequest_storeId_status_idx" ON "QuoteRequest"("storeId", "status");
CREATE INDEX "QuoteRequest_storeId_createdAt_idx" ON "QuoteRequest"("storeId", "createdAt");
CREATE TABLE "new_SelfHealingProposal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "suggestedFix" JSONB NOT NULL,
    "metadata" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "requiresConfirmation" BOOLEAN NOT NULL DEFAULT true,
    "occurrenceCount" INTEGER NOT NULL DEFAULT 1,
    "lastSeen" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "appliedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_SelfHealingProposal" ("appliedAt", "createdAt", "description", "id", "lastSeen", "metadata", "occurrenceCount", "requiresConfirmation", "status", "suggestedFix", "title", "type", "updatedAt") SELECT "appliedAt", "createdAt", "description", "id", "lastSeen", "metadata", "occurrenceCount", "requiresConfirmation", "status", "suggestedFix", "title", "type", "updatedAt" FROM "SelfHealingProposal";
DROP TABLE "SelfHealingProposal";
ALTER TABLE "new_SelfHealingProposal" RENAME TO "SelfHealingProposal";
CREATE INDEX "SelfHealingProposal_status_idx" ON "SelfHealingProposal"("status");
CREATE INDEX "SelfHealingProposal_type_idx" ON "SelfHealingProposal"("type");
CREATE INDEX "SelfHealingProposal_createdAt_idx" ON "SelfHealingProposal"("createdAt");
CREATE TABLE "new_SkillDispatchLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "traceId" TEXT NOT NULL,
    "userId" TEXT,
    "sessionId" TEXT,
    "query" TEXT NOT NULL,
    "intent" TEXT NOT NULL,
    "matchedSkill" TEXT,
    "confidence" REAL NOT NULL,
    "executionPath" TEXT,
    "outcome" TEXT,
    "latencyMs" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_SkillDispatchLog" ("confidence", "createdAt", "executionPath", "id", "intent", "latencyMs", "matchedSkill", "outcome", "query", "sessionId", "traceId", "userId") SELECT "confidence", "createdAt", "executionPath", "id", "intent", "latencyMs", "matchedSkill", "outcome", "query", "sessionId", "traceId", "userId" FROM "SkillDispatchLog";
DROP TABLE "SkillDispatchLog";
ALTER TABLE "new_SkillDispatchLog" RENAME TO "SkillDispatchLog";
CREATE INDEX "SkillDispatchLog_userId_createdAt_idx" ON "SkillDispatchLog"("userId", "createdAt");
CREATE INDEX "SkillDispatchLog_intent_confidence_idx" ON "SkillDispatchLog"("intent", "confidence");
CREATE INDEX "SkillDispatchLog_createdAt_idx" ON "SkillDispatchLog"("createdAt");
CREATE INDEX "SkillDispatchLog_traceId_idx" ON "SkillDispatchLog"("traceId");
CREATE TABLE "new_StoreActivityEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "storeId" TEXT NOT NULL,
    "actorUserId" TEXT,
    "sessionId" TEXT,
    "eventType" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "metadataJson" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StoreActivityEvent_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Business" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_StoreActivityEvent" ("actorUserId", "createdAt", "eventType", "id", "metadataJson", "sessionId", "source", "storeId") SELECT "actorUserId", "createdAt", "eventType", "id", "metadataJson", "sessionId", "source", "storeId" FROM "StoreActivityEvent";
DROP TABLE "StoreActivityEvent";
ALTER TABLE "new_StoreActivityEvent" RENAME TO "StoreActivityEvent";
CREATE INDEX "StoreActivityEvent_storeId_idx" ON "StoreActivityEvent"("storeId");
CREATE INDEX "StoreActivityEvent_storeId_eventType_idx" ON "StoreActivityEvent"("storeId", "eventType");
CREATE INDEX "StoreActivityEvent_storeId_createdAt_idx" ON "StoreActivityEvent"("storeId", "createdAt");
CREATE INDEX "StoreActivityEvent_eventType_createdAt_idx" ON "StoreActivityEvent"("eventType", "createdAt");
CREATE INDEX "StoreActivityEvent_storeId_sessionId_eventType_createdAt_idx" ON "StoreActivityEvent"("storeId", "sessionId", "eventType", "createdAt");
CREATE TABLE "new_StoreLeadActivity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "leadId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "message" TEXT,
    "metadata" JSONB,
    "createdBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StoreLeadActivity_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "BusinessLead" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_StoreLeadActivity" ("createdAt", "createdBy", "id", "leadId", "message", "metadata", "ownerId", "storeId", "type") SELECT "createdAt", "createdBy", "id", "leadId", "message", "metadata", "ownerId", "storeId", "type" FROM "StoreLeadActivity";
DROP TABLE "StoreLeadActivity";
ALTER TABLE "new_StoreLeadActivity" RENAME TO "StoreLeadActivity";
CREATE INDEX "StoreLeadActivity_leadId_idx" ON "StoreLeadActivity"("leadId");
CREATE INDEX "StoreLeadActivity_storeId_idx" ON "StoreLeadActivity"("storeId");
CREATE INDEX "StoreLeadActivity_type_idx" ON "StoreLeadActivity"("type");
CREATE INDEX "StoreLeadActivity_createdAt_idx" ON "StoreLeadActivity"("createdAt");
CREATE TABLE "new_StoreOutreachCampaign" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "templateBody" TEXT,
    "targetLeadIds" JSONB,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "openCount" INTEGER NOT NULL DEFAULT 0,
    "clickCount" INTEGER NOT NULL DEFAULT 0,
    "replyCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME
);
INSERT INTO "new_StoreOutreachCampaign" ("clickCount", "completedAt", "createdAt", "failedCount", "id", "name", "openCount", "ownerId", "replyCount", "sentCount", "status", "storeId", "targetLeadIds", "templateBody", "templateId") SELECT "clickCount", "completedAt", "createdAt", "failedCount", "id", "name", "openCount", "ownerId", "replyCount", "sentCount", "status", "storeId", "targetLeadIds", "templateBody", "templateId" FROM "StoreOutreachCampaign";
DROP TABLE "StoreOutreachCampaign";
ALTER TABLE "new_StoreOutreachCampaign" RENAME TO "StoreOutreachCampaign";
CREATE INDEX "StoreOutreachCampaign_storeId_idx" ON "StoreOutreachCampaign"("storeId");
CREATE INDEX "StoreOutreachCampaign_ownerId_idx" ON "StoreOutreachCampaign"("ownerId");
CREATE INDEX "StoreOutreachCampaign_status_idx" ON "StoreOutreachCampaign"("status");
CREATE TABLE "new_TelemetryNavigation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "eventType" TEXT NOT NULL,
    "userId" TEXT,
    "userRole" TEXT,
    "sessionId" TEXT,
    "fromPath" TEXT,
    "toPath" TEXT,
    "targetSection" TEXT,
    "searchQuery" TEXT,
    "timeOnPageMs" INTEGER,
    "environment" TEXT,
    "metadata" JSONB,
    "clientTs" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_TelemetryNavigation" ("clientTs", "createdAt", "environment", "eventType", "fromPath", "id", "metadata", "searchQuery", "sessionId", "targetSection", "timeOnPageMs", "toPath", "userId", "userRole") SELECT "clientTs", "createdAt", "environment", "eventType", "fromPath", "id", "metadata", "searchQuery", "sessionId", "targetSection", "timeOnPageMs", "toPath", "userId", "userRole" FROM "TelemetryNavigation";
DROP TABLE "TelemetryNavigation";
ALTER TABLE "new_TelemetryNavigation" RENAME TO "TelemetryNavigation";
CREATE INDEX "TelemetryNavigation_eventType_idx" ON "TelemetryNavigation"("eventType");
CREATE INDEX "TelemetryNavigation_createdAt_idx" ON "TelemetryNavigation"("createdAt");
CREATE INDEX "TelemetryNavigation_userId_idx" ON "TelemetryNavigation"("userId");
CREATE INDEX "TelemetryNavigation_sessionId_idx" ON "TelemetryNavigation"("sessionId");
CREATE INDEX "TelemetryNavigation_userRole_idx" ON "TelemetryNavigation"("userRole");
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "displayName" TEXT,
    "fullName" TEXT,
    "handle" TEXT,
    "avatarUrl" TEXT,
    "accountType" TEXT,
    "tagline" TEXT,
    "hasBusiness" BOOLEAN NOT NULL DEFAULT false,
    "onboarding" TEXT,
    "roles" TEXT NOT NULL DEFAULT '["viewer"]',
    "role" TEXT NOT NULL DEFAULT 'owner',
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "verificationToken" TEXT,
    "verificationTokenRaw" TEXT,
    "verificationExpires" DATETIME,
    "resetToken" TEXT,
    "resetExpires" DATETIME,
    "aiCreditsBalance" INTEGER NOT NULL DEFAULT 0,
    "welcomeFullStoreRemaining" INTEGER NOT NULL DEFAULT 1,
    "aiCreditsUpdatedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "profilePhoto" TEXT,
    "bio" TEXT,
    "qrCodeUrl" TEXT,
    "personalPresenceStoreId" TEXT,
    "phone" TEXT,
    "addressLine1" TEXT,
    "addressLine2" TEXT,
    "city" TEXT,
    "country" TEXT,
    "postcode" TEXT,
    "socialLinks" JSONB,
    CONSTRAINT "User_personalPresenceStoreId_fkey" FOREIGN KEY ("personalPresenceStoreId") REFERENCES "Business" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_User" ("accountType", "aiCreditsBalance", "aiCreditsUpdatedAt", "avatarUrl", "createdAt", "displayName", "email", "emailVerified", "fullName", "handle", "hasBusiness", "id", "onboarding", "passwordHash", "resetExpires", "resetToken", "role", "roles", "tagline", "updatedAt", "verificationExpires", "verificationToken", "verificationTokenRaw", "welcomeFullStoreRemaining") SELECT "accountType", "aiCreditsBalance", "aiCreditsUpdatedAt", "avatarUrl", "createdAt", "displayName", "email", "emailVerified", "fullName", "handle", "hasBusiness", "id", "onboarding", "passwordHash", "resetExpires", "resetToken", "role", "roles", "tagline", "updatedAt", "verificationExpires", "verificationToken", "verificationTokenRaw", "welcomeFullStoreRemaining" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "User_handle_key" ON "User"("handle");
CREATE UNIQUE INDEX "User_personalPresenceStoreId_key" ON "User"("personalPresenceStoreId");
CREATE INDEX "User_email_idx" ON "User"("email");
CREATE INDEX "User_handle_idx" ON "User"("handle");
CREATE INDEX "User_verificationToken_idx" ON "User"("verificationToken");
CREATE INDEX "User_resetToken_idx" ON "User"("resetToken");
CREATE TABLE "new_UserAccountEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "actorUserId" TEXT,
    "actorRole" TEXT,
    "reasonCode" TEXT,
    "publicReason" TEXT,
    "internalNote" TEXT,
    "previousStateJson" JSONB,
    "nextStateJson" JSONB,
    "requestId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserAccountEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_UserAccountEvent" ("actorRole", "actorUserId", "createdAt", "eventType", "id", "internalNote", "nextStateJson", "previousStateJson", "publicReason", "reasonCode", "requestId", "userId") SELECT "actorRole", "actorUserId", "createdAt", "eventType", "id", "internalNote", "nextStateJson", "previousStateJson", "publicReason", "reasonCode", "requestId", "userId" FROM "UserAccountEvent";
DROP TABLE "UserAccountEvent";
ALTER TABLE "new_UserAccountEvent" RENAME TO "UserAccountEvent";
CREATE INDEX "UserAccountEvent_userId_idx" ON "UserAccountEvent"("userId");
CREATE INDEX "UserAccountEvent_eventType_idx" ON "UserAccountEvent"("eventType");
CREATE INDEX "UserAccountEvent_createdAt_idx" ON "UserAccountEvent"("createdAt");
CREATE TABLE "new_UserMemory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "lastAction" TEXT,
    "lastActionAt" DATETIME,
    "visitCount" INTEGER NOT NULL DEFAULT 1,
    "actionHistory" JSONB NOT NULL,
    "abandonedTasks" JSONB NOT NULL,
    "completedTasks" JSONB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_UserMemory" ("abandonedTasks", "actionHistory", "completedTasks", "createdAt", "id", "lastAction", "lastActionAt", "updatedAt", "userId", "visitCount") SELECT "abandonedTasks", "actionHistory", "completedTasks", "createdAt", "id", "lastAction", "lastActionAt", "updatedAt", "userId", "visitCount" FROM "UserMemory";
DROP TABLE "UserMemory";
ALTER TABLE "new_UserMemory" RENAME TO "UserMemory";
CREATE UNIQUE INDEX "UserMemory_userId_key" ON "UserMemory"("userId");
CREATE INDEX "UserMemory_userId_idx" ON "UserMemory"("userId");
CREATE TABLE "new_business_ingestion_run" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "source" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'completed',
    "startedAt" DATETIME NOT NULL,
    "completedAt" DATETIME,
    "candidateCount" INTEGER NOT NULL DEFAULT 0,
    "seedCount" INTEGER NOT NULL DEFAULT 0,
    "duplicateCount" INTEGER NOT NULL DEFAULT 0,
    "rejectedCount" INTEGER NOT NULL DEFAULT 0,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "errorsJson" TEXT NOT NULL DEFAULT '[]',
    "metadataJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_business_ingestion_run" ("candidateCount", "completedAt", "createdAt", "duplicateCount", "errorCount", "errorsJson", "id", "metadataJson", "rejectedCount", "seedCount", "source", "startedAt", "status", "updatedAt") SELECT "candidateCount", "completedAt", "createdAt", "duplicateCount", "errorCount", "errorsJson", "id", "metadataJson", "rejectedCount", "seedCount", "source", "startedAt", "status", "updatedAt" FROM "business_ingestion_run";
DROP TABLE "business_ingestion_run";
ALTER TABLE "new_business_ingestion_run" RENAME TO "business_ingestion_run";
CREATE INDEX "business_ingestion_run_source_idx" ON "business_ingestion_run"("source");
CREATE INDEX "business_ingestion_run_status_idx" ON "business_ingestion_run"("status");
CREATE INDEX "business_ingestion_run_startedAt_idx" ON "business_ingestion_run"("startedAt");
CREATE TABLE "new_business_seed" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "source" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'seeded_pending_qa',
    "name" TEXT,
    "website" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "city" TEXT,
    "state" TEXT,
    "country" TEXT,
    "rawPayload" TEXT NOT NULL DEFAULT '{}',
    "dedupeKey" TEXT NOT NULL,
    "storeId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_business_seed" ("address", "city", "country", "createdAt", "dedupeKey", "email", "id", "name", "phone", "rawPayload", "source", "state", "status", "storeId", "updatedAt", "website") SELECT "address", "city", "country", "createdAt", "dedupeKey", "email", "id", "name", "phone", "rawPayload", "source", "state", "status", "storeId", "updatedAt", "website" FROM "business_seed";
DROP TABLE "business_seed";
ALTER TABLE "new_business_seed" RENAME TO "business_seed";
CREATE UNIQUE INDEX "business_seed_dedupeKey_key" ON "business_seed"("dedupeKey");
CREATE INDEX "business_seed_status_idx" ON "business_seed"("status");
CREATE INDEX "business_seed_source_idx" ON "business_seed"("source");
CREATE INDEX "business_seed_storeId_idx" ON "business_seed"("storeId");
CREATE TABLE "new_conversation_messages" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "session_id" TEXT NOT NULL,
    "mission_id" TEXT,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "content_json" JSONB,
    "tool_calls" JSONB,
    "artifacts" JSONB,
    "token_count" INTEGER,
    "sequence" INTEGER NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "conversation_messages_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "conversation_sessions" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "conversation_messages_mission_id_fkey" FOREIGN KEY ("mission_id") REFERENCES "MissionPipeline" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_conversation_messages" ("artifacts", "content", "content_json", "created_at", "id", "mission_id", "role", "sequence", "session_id", "token_count", "tool_calls") SELECT "artifacts", "content", "content_json", "created_at", "id", "mission_id", "role", "sequence", "session_id", "token_count", "tool_calls" FROM "conversation_messages";
DROP TABLE "conversation_messages";
ALTER TABLE "new_conversation_messages" RENAME TO "conversation_messages";
CREATE INDEX "conversation_messages_session_id_created_at_idx" ON "conversation_messages"("session_id", "created_at");
CREATE INDEX "conversation_messages_mission_id_idx" ON "conversation_messages"("mission_id");
CREATE UNIQUE INDEX "conversation_messages_session_id_sequence_key" ON "conversation_messages"("session_id", "sequence");
CREATE TABLE "new_conversation_pending_actions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "session_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "proposed_action" TEXT,
    "mission_id" TEXT,
    "step_id" TEXT,
    "payload_json" JSONB,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" DATETIME,
    CONSTRAINT "conversation_pending_actions_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "conversation_sessions" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_conversation_pending_actions" ("created_at", "id", "kind", "mission_id", "payload_json", "proposed_action", "resolved_at", "session_id", "status", "step_id") SELECT "created_at", "id", "kind", "mission_id", "payload_json", "proposed_action", "resolved_at", "session_id", "status", "step_id" FROM "conversation_pending_actions";
DROP TABLE "conversation_pending_actions";
ALTER TABLE "new_conversation_pending_actions" RENAME TO "conversation_pending_actions";
CREATE INDEX "conversation_pending_actions_session_id_status_idx" ON "conversation_pending_actions"("session_id", "status");
CREATE TABLE "new_conversation_sessions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "store_id" TEXT,
    "surface" TEXT NOT NULL DEFAULT 'performer_console',
    "status" TEXT NOT NULL DEFAULT 'active',
    "title" TEXT,
    "summary" TEXT,
    "message_count" INTEGER NOT NULL DEFAULT 0,
    "last_message_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "active_mission_id" TEXT,
    "metadata" JSONB,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "conversation_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_conversation_sessions" ("active_mission_id", "created_at", "id", "last_message_at", "message_count", "metadata", "status", "store_id", "summary", "surface", "title", "updated_at", "user_id") SELECT "active_mission_id", "created_at", "id", "last_message_at", "message_count", "metadata", "status", "store_id", "summary", "surface", "title", "updated_at", "user_id" FROM "conversation_sessions";
DROP TABLE "conversation_sessions";
ALTER TABLE "new_conversation_sessions" RENAME TO "conversation_sessions";
CREATE INDEX "conversation_sessions_user_id_status_last_message_at_idx" ON "conversation_sessions"("user_id", "status", "last_message_at");
CREATE INDEX "conversation_sessions_store_id_last_message_at_idx" ON "conversation_sessions"("store_id", "last_message_at");
CREATE TABLE "new_learning_behavior_patterns" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "pattern" TEXT NOT NULL,
    "frequency" INTEGER NOT NULL DEFAULT 1,
    "confidence" REAL NOT NULL DEFAULT 0.3,
    "last_observed" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);
INSERT INTO "new_learning_behavior_patterns" ("confidence", "created_at", "frequency", "id", "last_observed", "metadata", "pattern", "updated_at", "user_id") SELECT "confidence", "created_at", "frequency", "id", "last_observed", "metadata", "pattern", "updated_at", "user_id" FROM "learning_behavior_patterns";
DROP TABLE "learning_behavior_patterns";
ALTER TABLE "new_learning_behavior_patterns" RENAME TO "learning_behavior_patterns";
CREATE INDEX "learning_behavior_patterns_user_id_idx" ON "learning_behavior_patterns"("user_id");
CREATE UNIQUE INDEX "learning_behavior_patterns_user_id_pattern_key" ON "learning_behavior_patterns"("user_id", "pattern");
CREATE TABLE "new_learning_user_feedback" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "target_type" TEXT NOT NULL,
    "target_id" TEXT NOT NULL,
    "value" INTEGER,
    "metadata" JSONB,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_learning_user_feedback" ("created_at", "id", "metadata", "session_id", "target_id", "target_type", "type", "user_id", "value") SELECT "created_at", "id", "metadata", "session_id", "target_id", "target_type", "type", "user_id", "value" FROM "learning_user_feedback";
DROP TABLE "learning_user_feedback";
ALTER TABLE "new_learning_user_feedback" RENAME TO "learning_user_feedback";
CREATE INDEX "learning_user_feedback_user_id_session_id_idx" ON "learning_user_feedback"("user_id", "session_id");
CREATE INDEX "learning_user_feedback_user_id_type_idx" ON "learning_user_feedback"("user_id", "type");
CREATE INDEX "learning_user_feedback_target_type_target_id_idx" ON "learning_user_feedback"("target_type", "target_id");
CREATE TABLE "new_learning_user_profiles" (
    "user_id" TEXT NOT NULL PRIMARY KEY,
    "preferred_workflows" JSONB NOT NULL DEFAULT [],
    "skipped_steps" JSONB NOT NULL DEFAULT [],
    "frequently_used_tools" JSONB NOT NULL DEFAULT [],
    "default_action" TEXT,
    "confidence_calibration" JSONB,
    "learning_enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);
INSERT INTO "new_learning_user_profiles" ("confidence_calibration", "created_at", "default_action", "frequently_used_tools", "learning_enabled", "preferred_workflows", "skipped_steps", "updated_at", "user_id") SELECT "confidence_calibration", "created_at", "default_action", "frequently_used_tools", "learning_enabled", "preferred_workflows", "skipped_steps", "updated_at", "user_id" FROM "learning_user_profiles";
DROP TABLE "learning_user_profiles";
ALTER TABLE "new_learning_user_profiles" RENAME TO "learning_user_profiles";
CREATE TABLE "new_performer_session_contexts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "context_json" TEXT NOT NULL DEFAULT '{}',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    "ended_at" DATETIME
);
INSERT INTO "new_performer_session_contexts" ("active", "context_json", "created_at", "ended_at", "id", "session_id", "updated_at", "user_id") SELECT "active", "context_json", "created_at", "ended_at", "id", "session_id", "updated_at", "user_id" FROM "performer_session_contexts";
DROP TABLE "performer_session_contexts";
ALTER TABLE "new_performer_session_contexts" RENAME TO "performer_session_contexts";
CREATE INDEX "performer_session_contexts_user_id_session_id_active_idx" ON "performer_session_contexts"("user_id", "session_id", "active");
CREATE UNIQUE INDEX "performer_session_contexts_user_id_session_id_key" ON "performer_session_contexts"("user_id", "session_id");
CREATE TABLE "new_user_signal_preferences" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "enabledSignals" JSONB NOT NULL,
    "disabledSignals" JSONB NOT NULL,
    "customThresholds" JSONB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_user_signal_preferences" ("createdAt", "customThresholds", "disabledSignals", "enabledSignals", "id", "updatedAt", "userId") SELECT "createdAt", "customThresholds", "disabledSignals", "enabledSignals", "id", "updatedAt", "userId" FROM "user_signal_preferences";
DROP TABLE "user_signal_preferences";
ALTER TABLE "new_user_signal_preferences" RENAME TO "user_signal_preferences";
CREATE UNIQUE INDEX "user_signal_preferences_userId_key" ON "user_signal_preferences"("userId");
CREATE INDEX "user_signal_preferences_userId_idx" ON "user_signal_preferences"("userId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "TelemetryProbe_tag_idx" ON "TelemetryProbe"("tag");

-- CreateIndex
CREATE INDEX "TelemetryProbe_createdAt_idx" ON "TelemetryProbe"("createdAt");

-- CreateIndex
CREATE INDEX "TelemetryProbe_missionId_idx" ON "TelemetryProbe"("missionId");

-- CreateIndex
CREATE INDEX "PersonalMedia_userId_idx" ON "PersonalMedia"("userId");

-- CreateIndex
CREATE INDEX "ContentLibraryAsset_storeId_idx" ON "ContentLibraryAsset"("storeId");

-- CreateIndex
CREATE INDEX "MerchantDesign_storeId_idx" ON "MerchantDesign"("storeId");

-- CreateIndex
CREATE INDEX "DevSystemProposal_createdAt_idx" ON "DevSystemProposal"("createdAt");

-- CreateIndex
CREATE INDEX "DevSystemProposal_createdByUserId_idx" ON "DevSystemProposal"("createdByUserId");

-- CreateIndex
CREATE INDEX "DevSystemProposal_reviewedByUserId_idx" ON "DevSystemProposal"("reviewedByUserId");

-- CreateIndex
CREATE INDEX "DevSystemProposal_status_createdAt_idx" ON "DevSystemProposal"("status", "createdAt");

-- CreateIndex
CREATE INDEX "DevSystemProposal_type_createdAt_idx" ON "DevSystemProposal"("type", "createdAt");

-- CreateIndex
CREATE INDEX "DevSystemExecutionPreview_createdAt_idx" ON "DevSystemExecutionPreview"("createdAt");

-- CreateIndex
CREATE INDEX "DevSystemExecutionPreview_proposalId_createdAt_idx" ON "DevSystemExecutionPreview"("proposalId", "createdAt");

-- CreateIndex
CREATE INDEX "DevSystemExecutionPreview_createdByUserId_createdAt_idx" ON "DevSystemExecutionPreview"("createdByUserId", "createdAt");

-- CreateIndex
CREATE INDEX "DevSystemExecutionPreview_status_createdAt_idx" ON "DevSystemExecutionPreview"("status", "createdAt");

-- CreateIndex
CREATE INDEX "SecurityEvent_createdAt_idx" ON "SecurityEvent"("createdAt");

-- CreateIndex
CREATE INDEX "SecurityEvent_severity_createdAt_idx" ON "SecurityEvent"("severity", "createdAt");

-- CreateIndex
CREATE INDEX "SecurityEvent_type_createdAt_idx" ON "SecurityEvent"("type", "createdAt");

-- CreateIndex
CREATE INDEX "SecurityEvent_source_createdAt_idx" ON "SecurityEvent"("source", "createdAt");

-- CreateIndex
CREATE INDEX "SecurityEvent_isRead_createdAt_idx" ON "SecurityEvent"("isRead", "createdAt");

-- CreateIndex
CREATE INDEX "LoyaltyProgramStamp_tenantId_idx" ON "LoyaltyProgramStamp"("tenantId");

-- CreateIndex
CREATE INDEX "LoyaltyProgramStamp_storeId_idx" ON "LoyaltyProgramStamp"("storeId");

-- CreateIndex
CREATE INDEX "LoyaltyProgramStamp_programId_idx" ON "LoyaltyProgramStamp"("programId");

-- CreateIndex
CREATE INDEX "LoyaltyProgramStamp_customerId_idx" ON "LoyaltyProgramStamp"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "LoyaltyProgramStamp_tenantId_storeId_programId_customerId_key" ON "LoyaltyProgramStamp"("tenantId", "storeId", "programId", "customerId");

-- CreateIndex
CREATE INDEX "MissionBlackboard_missionId_seq_idx" ON "MissionBlackboard"("missionId", "seq");

-- CreateIndex
CREATE INDEX "MissionBlackboard_missionId_createdAt_idx" ON "MissionBlackboard"("missionId", "createdAt");

-- CreateIndex
CREATE INDEX "MissionBlackboard_correlationId_idx" ON "MissionBlackboard"("correlationId");

-- CreateIndex
CREATE UNIQUE INDEX "MissionBlackboard_missionId_seq_key" ON "MissionBlackboard"("missionId", "seq");

-- CreateIndex
CREATE INDEX "MissionOperatorRun_missionId_idx" ON "MissionOperatorRun"("missionId");

-- CreateIndex
CREATE INDEX "MissionOperatorRun_status_idx" ON "MissionOperatorRun"("status");

-- CreateIndex
CREATE INDEX "MissionOperatorRun_createdAt_idx" ON "MissionOperatorRun"("createdAt");

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
CREATE UNIQUE INDEX "McpToken_tokenHash_key" ON "McpToken"("tokenHash");

-- CreateIndex
CREATE INDEX "McpToken_userId_idx" ON "McpToken"("userId");

-- CreateIndex
CREATE INDEX "McpToken_storeId_idx" ON "McpToken"("storeId");

-- CreateIndex
CREATE INDEX "McpToken_tokenHash_idx" ON "McpToken"("tokenHash");

-- CreateIndex
CREATE INDEX "UserIdentifier_userId_idx" ON "UserIdentifier"("userId");

-- CreateIndex
CREATE INDEX "UserIdentifier_kind_hash_idx" ON "UserIdentifier"("kind", "hash");

-- CreateIndex
CREATE INDEX "UserIdentifier_verifiedAt_idx" ON "UserIdentifier"("verifiedAt");

-- CreateIndex
CREATE UNIQUE INDEX "UserIdentifier_kind_hash_hashVersion_key" ON "UserIdentifier"("kind", "hash", "hashVersion");

-- CreateIndex
CREATE INDEX "ContactSyncConsent_userId_status_idx" ON "ContactSyncConsent"("userId", "status");

-- CreateIndex
CREATE INDEX "ContactSyncConsent_userId_grantedAt_idx" ON "ContactSyncConsent"("userId", "grantedAt");

-- CreateIndex
CREATE INDEX "ContactSyncSource_userId_idx" ON "ContactSyncSource"("userId");

-- CreateIndex
CREATE INDEX "ContactSyncSource_consentId_idx" ON "ContactSyncSource"("consentId");

-- CreateIndex
CREATE INDEX "ContactSyncSource_status_lastSyncAt_idx" ON "ContactSyncSource"("status", "lastSyncAt");

-- CreateIndex
CREATE INDEX "ContactSyncJob_sourceId_startedAt_idx" ON "ContactSyncJob"("sourceId", "startedAt");

-- CreateIndex
CREATE INDEX "ContactSyncJob_status_startedAt_idx" ON "ContactSyncJob"("status", "startedAt");

-- CreateIndex
CREATE INDEX "ContactIdentifier_kind_hash_idx" ON "ContactIdentifier"("kind", "hash");

-- CreateIndex
CREATE INDEX "ContactIdentifier_sourceId_lastSeenAt_idx" ON "ContactIdentifier"("sourceId", "lastSeenAt");

-- CreateIndex
CREATE UNIQUE INDEX "ContactIdentifier_sourceId_kind_hash_hashVersion_key" ON "ContactIdentifier"("sourceId", "kind", "hash", "hashVersion");

-- CreateIndex
CREATE INDEX "ContactMatch_matchedUserId_idx" ON "ContactMatch"("matchedUserId");

-- CreateIndex
CREATE INDEX "ContactMatch_sourceId_lastSeenAt_idx" ON "ContactMatch"("sourceId", "lastSeenAt");

-- CreateIndex
CREATE UNIQUE INDEX "ContactMatch_sourceId_matchedUserId_key" ON "ContactMatch"("sourceId", "matchedUserId");

-- CreateIndex
CREATE INDEX "ContactSuggestion_userId_status_rankScore_idx" ON "ContactSuggestion"("userId", "status", "rankScore");

-- CreateIndex
CREATE INDEX "ContactSuggestion_userId_createdAt_idx" ON "ContactSuggestion"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ContactSuggestion_expiresAt_idx" ON "ContactSuggestion"("expiresAt");

-- CreateIndex
CREATE INDEX "Card_userId_createdAt_idx" ON "Card"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "SmartDocument_userId_createdAt_idx" ON "SmartDocument"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "SmartDocument_businessId_createdAt_idx" ON "SmartDocument"("businessId", "createdAt");

-- CreateIndex
CREATE INDEX "SmartDocument_docType_status_idx" ON "SmartDocument"("docType", "status");

-- CreateIndex
CREATE INDEX "SmartDocument_phase_status_idx" ON "SmartDocument"("phase", "status");

-- CreateIndex
CREATE UNIQUE INDEX "DocVisitor_sessionToken_key" ON "DocVisitor"("sessionToken");

-- CreateIndex
CREATE INDEX "DocVisitor_docId_lastSeenAt_idx" ON "DocVisitor"("docId", "lastSeenAt");

-- CreateIndex
CREATE INDEX "DocVisitor_platformVisitorId_idx" ON "DocVisitor"("platformVisitorId");

-- CreateIndex
CREATE INDEX "DocConversation_docId_updatedAt_idx" ON "DocConversation"("docId", "updatedAt");

-- CreateIndex
CREATE INDEX "DocConversation_visitorId_updatedAt_idx" ON "DocConversation"("visitorId", "updatedAt");

-- CreateIndex
CREATE INDEX "DocConversation_channel_createdAt_idx" ON "DocConversation"("channel", "createdAt");

-- CreateIndex
CREATE INDEX "DocScheduledMessage_docId_sendAt_idx" ON "DocScheduledMessage"("docId", "sendAt");

-- CreateIndex
CREATE INDEX "DocScheduledMessage_status_sendAt_idx" ON "DocScheduledMessage"("status", "sendAt");

-- CreateIndex
CREATE INDEX "DocumentPromoRedemption_docId_redeemedAt_idx" ON "DocumentPromoRedemption"("docId", "redeemedAt");

-- CreateIndex
CREATE INDEX "DocumentPromoRedemption_visitorId_redeemedAt_idx" ON "DocumentPromoRedemption"("visitorId", "redeemedAt");

-- CreateIndex
CREATE INDEX "EventRsvp_docId_rsvpAt_idx" ON "EventRsvp"("docId", "rsvpAt");

-- CreateIndex
CREATE INDEX "EventRsvp_visitorId_rsvpAt_idx" ON "EventRsvp"("visitorId", "rsvpAt");

-- CreateIndex
CREATE INDEX "DocCheckIn_docId_checkedInAt_idx" ON "DocCheckIn"("docId", "checkedInAt");

-- CreateIndex
CREATE INDEX "DocCheckIn_visitorId_checkedInAt_idx" ON "DocCheckIn"("visitorId", "checkedInAt");

-- CreateIndex
CREATE INDEX "DocSignature_docId_signedAt_idx" ON "DocSignature"("docId", "signedAt");

-- CreateIndex
CREATE INDEX "DocSignature_visitorId_signedAt_idx" ON "DocSignature"("visitorId", "signedAt");
