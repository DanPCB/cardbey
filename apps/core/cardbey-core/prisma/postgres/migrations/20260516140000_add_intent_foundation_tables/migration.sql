-- Intent capture / opportunities / MI runway tables present in schema but missing from Postgres history.
-- Idempotent: safe on partial deploys.

CREATE TABLE IF NOT EXISTS "IntentSignal" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "offerId" TEXT,
    "code" TEXT,
    "userAgent" TEXT,
    "referrer" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "IntentSignal_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "IntentSignal_storeId_idx" ON "IntentSignal"("storeId");
CREATE INDEX IF NOT EXISTS "IntentSignal_offerId_idx" ON "IntentSignal"("offerId");
CREATE INDEX IF NOT EXISTS "IntentSignal_type_createdAt_idx" ON "IntentSignal"("type", "createdAt");

CREATE TABLE IF NOT EXISTS "StoreOffer" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "priceText" TEXT,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "StoreOffer_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "StoreOffer_storeId_slug_key" ON "StoreOffer"("storeId", "slug");
CREATE INDEX IF NOT EXISTS "StoreOffer_storeId_idx" ON "StoreOffer"("storeId");
CREATE INDEX IF NOT EXISTS "StoreOffer_isActive_idx" ON "StoreOffer"("isActive");

DO $$ BEGIN
  ALTER TABLE "StoreOffer" ADD CONSTRAINT "StoreOffer_storeId_fkey"
    FOREIGN KEY ("storeId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "IntentOpportunity" (
    "id" TEXT NOT NULL,
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
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "IntentOpportunity_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "IntentOpportunity_storeId_idx" ON "IntentOpportunity"("storeId");
CREATE INDEX IF NOT EXISTS "IntentOpportunity_storeId_status_idx" ON "IntentOpportunity"("storeId", "status");
CREATE INDEX IF NOT EXISTS "IntentOpportunity_storeId_source_idx" ON "IntentOpportunity"("storeId", "source");
CREATE INDEX IF NOT EXISTS "IntentOpportunity_createdAt_idx" ON "IntentOpportunity"("createdAt");

CREATE TABLE IF NOT EXISTS "OpportunityInferenceRun" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "lastRunAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OpportunityInferenceRun_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "OpportunityInferenceRun_storeId_key" ON "OpportunityInferenceRun"("storeId");
CREATE INDEX IF NOT EXISTS "OpportunityInferenceRun_lastRunAt_idx" ON "OpportunityInferenceRun"("lastRunAt");

CREATE TABLE IF NOT EXISTS "IntentRequest" (
    "id" TEXT NOT NULL,
    "missionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "agent" TEXT,
    "payload" JSONB,
    "result" JSONB,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "IntentRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "IntentRequest_missionId_status_idx" ON "IntentRequest"("missionId", "status");
CREATE INDEX IF NOT EXISTS "IntentRequest_missionId_createdAt_idx" ON "IntentRequest"("missionId", "createdAt");

DO $$ BEGIN
  ALTER TABLE "IntentRequest" ADD CONSTRAINT "IntentRequest_missionId_fkey"
    FOREIGN KEY ("missionId") REFERENCES "Mission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "PersonalMedia" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PersonalMedia_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "PersonalMedia_userId_idx" ON "PersonalMedia"("userId");

DO $$ BEGIN
  ALTER TABLE "PersonalMedia" ADD CONSTRAINT "PersonalMedia_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "MerchantDesign" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "name" TEXT,
    "specJson" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MerchantDesign_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "MerchantDesign_storeId_idx" ON "MerchantDesign"("storeId");

DO $$ BEGIN
  ALTER TABLE "MerchantDesign" ADD CONSTRAINT "MerchantDesign_storeId_fkey"
    FOREIGN KEY ("storeId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "Card" (
    "id" TEXT NOT NULL,
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
    "sizeW" DOUBLE PRECISION NOT NULL,
    "sizeH" DOUBLE PRECISION NOT NULL,
    "sizeUnit" TEXT NOT NULL,
    "sizeDpi" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Card_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Card_userId_createdAt_idx" ON "Card"("userId", "createdAt");

DO $$ BEGIN
  ALTER TABLE "Card" ADD CONSTRAINT "Card_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "DevSystemProposal" (
    "id" TEXT NOT NULL,
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
    "reviewedAt" TIMESTAMP(3),
    "reviewDecisionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DevSystemProposal_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "DevSystemProposal_createdAt_idx" ON "DevSystemProposal"("createdAt");
CREATE INDEX IF NOT EXISTS "DevSystemProposal_createdByUserId_idx" ON "DevSystemProposal"("createdByUserId");
CREATE INDEX IF NOT EXISTS "DevSystemProposal_reviewedByUserId_idx" ON "DevSystemProposal"("reviewedByUserId");
CREATE INDEX IF NOT EXISTS "DevSystemProposal_status_createdAt_idx" ON "DevSystemProposal"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "DevSystemProposal_type_createdAt_idx" ON "DevSystemProposal"("type", "createdAt");

CREATE TABLE IF NOT EXISTS "DevSystemExecutionPreview" (
    "id" TEXT NOT NULL,
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
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DevSystemExecutionPreview_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "DevSystemExecutionPreview_createdAt_idx" ON "DevSystemExecutionPreview"("createdAt");
CREATE INDEX IF NOT EXISTS "DevSystemExecutionPreview_proposalId_createdAt_idx" ON "DevSystemExecutionPreview"("proposalId", "createdAt");
CREATE INDEX IF NOT EXISTS "DevSystemExecutionPreview_createdByUserId_createdAt_idx" ON "DevSystemExecutionPreview"("createdByUserId", "createdAt");
CREATE INDEX IF NOT EXISTS "DevSystemExecutionPreview_status_createdAt_idx" ON "DevSystemExecutionPreview"("status", "createdAt");

CREATE TABLE IF NOT EXISTS "SecurityEvent" (
    "id" TEXT NOT NULL,
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
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SecurityEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "SecurityEvent_createdAt_idx" ON "SecurityEvent"("createdAt");
CREATE INDEX IF NOT EXISTS "SecurityEvent_severity_createdAt_idx" ON "SecurityEvent"("severity", "createdAt");
CREATE INDEX IF NOT EXISTS "SecurityEvent_type_createdAt_idx" ON "SecurityEvent"("type", "createdAt");
CREATE INDEX IF NOT EXISTS "SecurityEvent_source_createdAt_idx" ON "SecurityEvent"("source", "createdAt");
CREATE INDEX IF NOT EXISTS "SecurityEvent_isRead_createdAt_idx" ON "SecurityEvent"("isRead", "createdAt");
