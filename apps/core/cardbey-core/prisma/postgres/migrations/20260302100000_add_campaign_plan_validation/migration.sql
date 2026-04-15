-- Phase A: Campaign scope validation (CampaignPlan + CampaignValidationResult)
-- CreateTable CampaignPlan
CREATE TABLE "CampaignPlan" (
    "id" TEXT NOT NULL,
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
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CampaignPlan_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CampaignPlan_tenantKey_createdAt_idx" ON "CampaignPlan"("tenantKey", "createdAt");
CREATE INDEX "CampaignPlan_missionId_idx" ON "CampaignPlan"("missionId");

-- CreateTable CampaignValidationResult
CREATE TABLE "CampaignValidationResult" (
    "id" TEXT NOT NULL,
    "tenantKey" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "checks" JSONB NOT NULL,
    "blockers" JSONB NOT NULL,
    "warnings" JSONB NOT NULL,
    "risk" TEXT NOT NULL DEFAULT 'med',
    "confidence" TEXT NOT NULL DEFAULT 'med',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CampaignValidationResult_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CampaignValidationResult_tenantKey_createdAt_idx" ON "CampaignValidationResult"("tenantKey", "createdAt");
CREATE INDEX "CampaignValidationResult_planId_idx" ON "CampaignValidationResult"("planId");

ALTER TABLE "CampaignValidationResult" ADD CONSTRAINT "CampaignValidationResult_planId_fkey" FOREIGN KEY ("planId") REFERENCES "CampaignPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
