-- Add models present in prisma/sqlite/schema.prisma but missing from Postgres migrations.
-- Idempotent: safe to re-run on partial deploys.

-- Mission pipeline (performer / store build)
CREATE TABLE IF NOT EXISTS "MissionPipeline" (
    "id" TEXT NOT NULL,
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
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    CONSTRAINT "MissionPipeline_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "MissionPipeline_tenantId_status_idx" ON "MissionPipeline"("tenantId", "status");
CREATE INDEX IF NOT EXISTS "MissionPipeline_createdAt_idx" ON "MissionPipeline"("createdAt");
CREATE INDEX IF NOT EXISTS "MissionPipeline_status_runState_idx" ON "MissionPipeline"("status", "runState");

CREATE TABLE IF NOT EXISTS "MissionPipelineStep" (
    "id" TEXT NOT NULL,
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
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MissionPipelineStep_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "MissionPipelineStep_missionId_orderIndex_idx" ON "MissionPipelineStep"("missionId", "orderIndex");

DO $$ BEGIN
  ALTER TABLE "MissionPipelineStep" ADD CONSTRAINT "MissionPipelineStep_missionId_fkey"
    FOREIGN KEY ("missionId") REFERENCES "MissionPipeline"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "MissionContext" (
    "id" TEXT NOT NULL,
    "missionId" TEXT NOT NULL,
    "contextJson" TEXT NOT NULL DEFAULT '{}',
    "snapshotsJson" TEXT NOT NULL DEFAULT '[]',
    "outcomeJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MissionContext_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "MissionContext_missionId_key" ON "MissionContext"("missionId");
CREATE INDEX IF NOT EXISTS "MissionContext_missionId_idx" ON "MissionContext"("missionId");

-- AI operator state (build_store)
CREATE TABLE IF NOT EXISTS "MissionOperatorRun" (
    "id" TEXT NOT NULL,
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
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MissionOperatorRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "MissionOperatorRun_missionId_idx" ON "MissionOperatorRun"("missionId");
CREATE INDEX IF NOT EXISTS "MissionOperatorRun_status_idx" ON "MissionOperatorRun"("status");
CREATE INDEX IF NOT EXISTS "MissionOperatorRun_createdAt_idx" ON "MissionOperatorRun"("createdAt");

-- Unified mission router (fast/agent path) — separate from MissionOperatorRun
CREATE TABLE IF NOT EXISTS "MissionRun" (
    "id" TEXT NOT NULL,
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
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MissionRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "MissionRun_userId_idx" ON "MissionRun"("userId");
CREATE INDEX IF NOT EXISTS "MissionRun_storeId_idx" ON "MissionRun"("storeId");
CREATE INDEX IF NOT EXISTS "MissionRun_status_idx" ON "MissionRun"("status");
CREATE INDEX IF NOT EXISTS "MissionRun_createdAt_idx" ON "MissionRun"("createdAt");

ALTER TABLE "AgentMessage" ADD COLUMN IF NOT EXISTS "missionRunId" TEXT;
CREATE INDEX IF NOT EXISTS "AgentMessage_missionRunId_idx" ON "AgentMessage"("missionRunId");

DO $$ BEGIN
  ALTER TABLE "AgentMessage" ADD CONSTRAINT "AgentMessage_missionRunId_fkey"
    FOREIGN KEY ("missionRunId") REFERENCES "MissionRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Telemetry
CREATE TABLE IF NOT EXISTS "TelemetryProbe" (
    "id" TEXT NOT NULL,
    "tag" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "missionId" TEXT,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TelemetryProbe_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "TelemetryProbe_tag_idx" ON "TelemetryProbe"("tag");
CREATE INDEX IF NOT EXISTS "TelemetryProbe_createdAt_idx" ON "TelemetryProbe"("createdAt");
CREATE INDEX IF NOT EXISTS "TelemetryProbe_missionId_idx" ON "TelemetryProbe"("missionId");

-- Promotion slot pipeline
CREATE TABLE IF NOT EXISTS "Promotion" (
    "id" TEXT NOT NULL,
    "storeId" TEXT,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT,
    "mediaType" TEXT,
    "mediaUrl" TEXT,
    "ctaLabel" TEXT,
    "ctaUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "startAt" TIMESTAMP(3),
    "endAt" TIMESTAMP(3),
    "priority" INTEGER NOT NULL DEFAULT 0,
    "metadataJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Promotion_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Promotion_storeId_idx" ON "Promotion"("storeId");
CREATE INDEX IF NOT EXISTS "Promotion_status_idx" ON "Promotion"("status");
CREATE INDEX IF NOT EXISTS "Promotion_startAt_endAt_idx" ON "Promotion"("startAt", "endAt");

CREATE TABLE IF NOT EXISTS "PromotionSlot" (
    "id" TEXT NOT NULL,
    "slotKey" TEXT NOT NULL,
    "surfaceType" TEXT NOT NULL,
    "displayMode" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "configJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PromotionSlot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PromotionSlot_slotKey_key" ON "PromotionSlot"("slotKey");
CREATE INDEX IF NOT EXISTS "PromotionSlot_slotKey_idx" ON "PromotionSlot"("slotKey");
CREATE INDEX IF NOT EXISTS "PromotionSlot_isActive_idx" ON "PromotionSlot"("isActive");

CREATE TABLE IF NOT EXISTS "PromotionPlacement" (
    "id" TEXT NOT NULL,
    "promotionId" TEXT NOT NULL,
    "slotId" TEXT NOT NULL,
    "storeId" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "startAt" TIMESTAMP(3),
    "endAt" TIMESTAMP(3),
    "priority" INTEGER NOT NULL DEFAULT 0,
    "metadataJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PromotionPlacement_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "PromotionPlacement_promotionId_idx" ON "PromotionPlacement"("promotionId");
CREATE INDEX IF NOT EXISTS "PromotionPlacement_slotId_idx" ON "PromotionPlacement"("slotId");
CREATE INDEX IF NOT EXISTS "PromotionPlacement_storeId_idx" ON "PromotionPlacement"("storeId");
CREATE INDEX IF NOT EXISTS "PromotionPlacement_slotId_storeId_idx" ON "PromotionPlacement"("slotId", "storeId");
CREATE INDEX IF NOT EXISTS "PromotionPlacement_enabled_idx" ON "PromotionPlacement"("enabled");

DO $$ BEGIN
  ALTER TABLE "PromotionPlacement" ADD CONSTRAINT "PromotionPlacement_promotionId_fkey"
    FOREIGN KEY ("promotionId") REFERENCES "Promotion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "PromotionPlacement" ADD CONSTRAINT "PromotionPlacement_slotId_fkey"
    FOREIGN KEY ("slotId") REFERENCES "PromotionSlot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- MCP tokens
CREATE TABLE IF NOT EXISTS "McpToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "label" TEXT NOT NULL DEFAULT 'MCP Token',
    "revoked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),
    CONSTRAINT "McpToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "McpToken_tokenHash_key" ON "McpToken"("tokenHash");
CREATE INDEX IF NOT EXISTS "McpToken_userId_idx" ON "McpToken"("userId");
CREATE INDEX IF NOT EXISTS "McpToken_storeId_idx" ON "McpToken"("storeId");
CREATE INDEX IF NOT EXISTS "McpToken_tokenHash_idx" ON "McpToken"("tokenHash");

-- Contact sync phase 1
CREATE TABLE IF NOT EXISTS "UserIdentifier" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "hashVersion" TEXT NOT NULL DEFAULT 'v1',
    "source" TEXT NOT NULL DEFAULT 'email',
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "UserIdentifier_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "UserIdentifier_kind_hash_hashVersion_key" ON "UserIdentifier"("kind", "hash", "hashVersion");
CREATE INDEX IF NOT EXISTS "UserIdentifier_userId_idx" ON "UserIdentifier"("userId");
CREATE INDEX IF NOT EXISTS "UserIdentifier_kind_hash_idx" ON "UserIdentifier"("kind", "hash");
CREATE INDEX IF NOT EXISTS "UserIdentifier_verifiedAt_idx" ON "UserIdentifier"("verifiedAt");

DO $$ BEGIN
  ALTER TABLE "UserIdentifier" ADD CONSTRAINT "UserIdentifier_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "ContactSyncConsent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'granted',
    "policyVersion" TEXT NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ContactSyncConsent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ContactSyncConsent_userId_status_idx" ON "ContactSyncConsent"("userId", "status");
CREATE INDEX IF NOT EXISTS "ContactSyncConsent_userId_grantedAt_idx" ON "ContactSyncConsent"("userId", "grantedAt");

CREATE TABLE IF NOT EXISTS "ContactSyncSource" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "consentId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "deviceFingerprint" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "lastSyncAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ContactSyncSource_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ContactSyncSource_userId_idx" ON "ContactSyncSource"("userId");
CREATE INDEX IF NOT EXISTS "ContactSyncSource_consentId_idx" ON "ContactSyncSource"("consentId");
CREATE INDEX IF NOT EXISTS "ContactSyncSource_status_lastSyncAt_idx" ON "ContactSyncSource"("status", "lastSyncAt");

DO $$ BEGIN
  ALTER TABLE "ContactSyncSource" ADD CONSTRAINT "ContactSyncSource_consentId_fkey"
    FOREIGN KEY ("consentId") REFERENCES "ContactSyncConsent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "ContactSyncJob" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'started',
    "counts" JSONB,
    "errorCode" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    CONSTRAINT "ContactSyncJob_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ContactSyncJob_sourceId_startedAt_idx" ON "ContactSyncJob"("sourceId", "startedAt");
CREATE INDEX IF NOT EXISTS "ContactSyncJob_status_startedAt_idx" ON "ContactSyncJob"("status", "startedAt");

DO $$ BEGIN
  ALTER TABLE "ContactSyncJob" ADD CONSTRAINT "ContactSyncJob_sourceId_fkey"
    FOREIGN KEY ("sourceId") REFERENCES "ContactSyncSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "ContactIdentifier" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "hashVersion" TEXT NOT NULL DEFAULT 'v1',
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ContactIdentifier_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ContactIdentifier_sourceId_kind_hash_hashVersion_key" ON "ContactIdentifier"("sourceId", "kind", "hash", "hashVersion");
CREATE INDEX IF NOT EXISTS "ContactIdentifier_kind_hash_idx" ON "ContactIdentifier"("kind", "hash");
CREATE INDEX IF NOT EXISTS "ContactIdentifier_sourceId_lastSeenAt_idx" ON "ContactIdentifier"("sourceId", "lastSeenAt");

DO $$ BEGIN
  ALTER TABLE "ContactIdentifier" ADD CONSTRAINT "ContactIdentifier_sourceId_fkey"
    FOREIGN KEY ("sourceId") REFERENCES "ContactSyncSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "ContactMatch" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "matchedUserId" TEXT NOT NULL,
    "matchBasis" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ContactMatch_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ContactMatch_sourceId_matchedUserId_key" ON "ContactMatch"("sourceId", "matchedUserId");
CREATE INDEX IF NOT EXISTS "ContactMatch_matchedUserId_idx" ON "ContactMatch"("matchedUserId");
CREATE INDEX IF NOT EXISTS "ContactMatch_sourceId_lastSeenAt_idx" ON "ContactMatch"("sourceId", "lastSeenAt");

DO $$ BEGIN
  ALTER TABLE "ContactMatch" ADD CONSTRAINT "ContactMatch_sourceId_fkey"
    FOREIGN KEY ("sourceId") REFERENCES "ContactSyncSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "ContactSuggestion" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "matchedUserId" TEXT,
    "rankScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "reasonCode" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    CONSTRAINT "ContactSuggestion_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ContactSuggestion_userId_status_rankScore_idx" ON "ContactSuggestion"("userId", "status", "rankScore");
CREATE INDEX IF NOT EXISTS "ContactSuggestion_userId_createdAt_idx" ON "ContactSuggestion"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "ContactSuggestion_expiresAt_idx" ON "ContactSuggestion"("expiresAt");

-- SmartDocument layer (document-scoped loyalty/promo use separate tables)
CREATE TABLE IF NOT EXISTS "SmartDocument" (
    "id" TEXT NOT NULL,
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
    "sizeW" DOUBLE PRECISION,
    "sizeH" DOUBLE PRECISION,
    "sizeUnit" TEXT DEFAULT 'mm',
    "sizeDpi" INTEGER DEFAULT 300,
    "agentPersonality" TEXT,
    "knowledgeBase" TEXT,
    "capabilities" TEXT NOT NULL DEFAULT '[]',
    "autoApprove" BOOLEAN NOT NULL DEFAULT true,
    "phaseConfig" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SmartDocument_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "SmartDocument_userId_createdAt_idx" ON "SmartDocument"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "SmartDocument_businessId_createdAt_idx" ON "SmartDocument"("businessId", "createdAt");
CREATE INDEX IF NOT EXISTS "SmartDocument_docType_status_idx" ON "SmartDocument"("docType", "status");
CREATE INDEX IF NOT EXISTS "SmartDocument_phase_status_idx" ON "SmartDocument"("phase", "status");

DO $$ BEGIN
  ALTER TABLE "SmartDocument" ADD CONSTRAINT "SmartDocument_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "SmartDocument" ADD CONSTRAINT "SmartDocument_businessId_fkey"
    FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "DocVisitor" (
    "id" TEXT NOT NULL,
    "docId" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "name" TEXT,
    "platformVisitorId" TEXT,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DocVisitor_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "DocVisitor_sessionToken_key" ON "DocVisitor"("sessionToken");
CREATE INDEX IF NOT EXISTS "DocVisitor_docId_lastSeenAt_idx" ON "DocVisitor"("docId", "lastSeenAt");
CREATE INDEX IF NOT EXISTS "DocVisitor_platformVisitorId_idx" ON "DocVisitor"("platformVisitorId");

DO $$ BEGIN
  ALTER TABLE "DocVisitor" ADD CONSTRAINT "DocVisitor_docId_fkey"
    FOREIGN KEY ("docId") REFERENCES "SmartDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "DocConversation" (
    "id" TEXT NOT NULL,
    "docId" TEXT NOT NULL,
    "visitorId" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'web',
    "messages" TEXT NOT NULL DEFAULT '[]',
    "outcome" TEXT,
    "intent" TEXT,
    "sentiment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DocConversation_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "DocConversation_docId_updatedAt_idx" ON "DocConversation"("docId", "updatedAt");
CREATE INDEX IF NOT EXISTS "DocConversation_visitorId_updatedAt_idx" ON "DocConversation"("visitorId", "updatedAt");
CREATE INDEX IF NOT EXISTS "DocConversation_channel_createdAt_idx" ON "DocConversation"("channel", "createdAt");

DO $$ BEGIN
  ALTER TABLE "DocConversation" ADD CONSTRAINT "DocConversation_docId_fkey"
    FOREIGN KEY ("docId") REFERENCES "SmartDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "DocConversation" ADD CONSTRAINT "DocConversation_visitorId_fkey"
    FOREIGN KEY ("visitorId") REFERENCES "DocVisitor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "DocScheduledMessage" (
    "id" TEXT NOT NULL,
    "docId" TEXT NOT NULL,
    "sendAt" TIMESTAMP(3) NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'web',
    "payload" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "sentAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DocScheduledMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "DocScheduledMessage_docId_sendAt_idx" ON "DocScheduledMessage"("docId", "sendAt");
CREATE INDEX IF NOT EXISTS "DocScheduledMessage_status_sendAt_idx" ON "DocScheduledMessage"("status", "sendAt");

DO $$ BEGIN
  ALTER TABLE "DocScheduledMessage" ADD CONSTRAINT "DocScheduledMessage_docId_fkey"
    FOREIGN KEY ("docId") REFERENCES "SmartDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "DocumentLoyaltyStamp" (
    "id" TEXT NOT NULL,
    "docId" TEXT NOT NULL,
    "visitorId" TEXT NOT NULL,
    "stampedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "redeemedAt" TIMESTAMP(3),
    CONSTRAINT "DocumentLoyaltyStamp_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "DocumentLoyaltyStamp_docId_stampedAt_idx" ON "DocumentLoyaltyStamp"("docId", "stampedAt");
CREATE INDEX IF NOT EXISTS "DocumentLoyaltyStamp_visitorId_stampedAt_idx" ON "DocumentLoyaltyStamp"("visitorId", "stampedAt");

DO $$ BEGIN
  ALTER TABLE "DocumentLoyaltyStamp" ADD CONSTRAINT "DocumentLoyaltyStamp_docId_fkey"
    FOREIGN KEY ("docId") REFERENCES "SmartDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "DocumentLoyaltyStamp" ADD CONSTRAINT "DocumentLoyaltyStamp_visitorId_fkey"
    FOREIGN KEY ("visitorId") REFERENCES "DocVisitor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "DocumentPromoRedemption" (
    "id" TEXT NOT NULL,
    "docId" TEXT NOT NULL,
    "visitorId" TEXT NOT NULL,
    "redeemedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "discountApplied" TEXT,
    CONSTRAINT "DocumentPromoRedemption_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "DocumentPromoRedemption_docId_redeemedAt_idx" ON "DocumentPromoRedemption"("docId", "redeemedAt");
CREATE INDEX IF NOT EXISTS "DocumentPromoRedemption_visitorId_redeemedAt_idx" ON "DocumentPromoRedemption"("visitorId", "redeemedAt");

DO $$ BEGIN
  ALTER TABLE "DocumentPromoRedemption" ADD CONSTRAINT "DocumentPromoRedemption_docId_fkey"
    FOREIGN KEY ("docId") REFERENCES "SmartDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "DocumentPromoRedemption" ADD CONSTRAINT "DocumentPromoRedemption_visitorId_fkey"
    FOREIGN KEY ("visitorId") REFERENCES "DocVisitor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "EventRsvp" (
    "id" TEXT NOT NULL,
    "docId" TEXT NOT NULL,
    "visitorId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "rsvpAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EventRsvp_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "EventRsvp_docId_rsvpAt_idx" ON "EventRsvp"("docId", "rsvpAt");
CREATE INDEX IF NOT EXISTS "EventRsvp_visitorId_rsvpAt_idx" ON "EventRsvp"("visitorId", "rsvpAt");

DO $$ BEGIN
  ALTER TABLE "EventRsvp" ADD CONSTRAINT "EventRsvp_docId_fkey"
    FOREIGN KEY ("docId") REFERENCES "SmartDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "EventRsvp" ADD CONSTRAINT "EventRsvp_visitorId_fkey"
    FOREIGN KEY ("visitorId") REFERENCES "DocVisitor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "DocCheckIn" (
    "id" TEXT NOT NULL,
    "docId" TEXT NOT NULL,
    "visitorId" TEXT NOT NULL,
    "checkedInAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,
    CONSTRAINT "DocCheckIn_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "DocCheckIn_docId_checkedInAt_idx" ON "DocCheckIn"("docId", "checkedInAt");
CREATE INDEX IF NOT EXISTS "DocCheckIn_visitorId_checkedInAt_idx" ON "DocCheckIn"("visitorId", "checkedInAt");

DO $$ BEGIN
  ALTER TABLE "DocCheckIn" ADD CONSTRAINT "DocCheckIn_docId_fkey"
    FOREIGN KEY ("docId") REFERENCES "SmartDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "DocCheckIn" ADD CONSTRAINT "DocCheckIn_visitorId_fkey"
    FOREIGN KEY ("visitorId") REFERENCES "DocVisitor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "DocSignature" (
    "id" TEXT NOT NULL,
    "docId" TEXT NOT NULL,
    "visitorId" TEXT NOT NULL,
    "signedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "signatureUrl" TEXT,
    "ipAddress" TEXT,
    CONSTRAINT "DocSignature_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "DocSignature_docId_signedAt_idx" ON "DocSignature"("docId", "signedAt");
CREATE INDEX IF NOT EXISTS "DocSignature_visitorId_signedAt_idx" ON "DocSignature"("visitorId", "signedAt");

DO $$ BEGIN
  ALTER TABLE "DocSignature" ADD CONSTRAINT "DocSignature_docId_fkey"
    FOREIGN KEY ("docId") REFERENCES "SmartDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "DocSignature" ADD CONSTRAINT "DocSignature_visitorId_fkey"
    FOREIGN KEY ("visitorId") REFERENCES "DocVisitor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
