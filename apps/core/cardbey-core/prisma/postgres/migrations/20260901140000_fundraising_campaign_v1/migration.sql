-- Fundraising Campaign V1 (Postgres)
CREATE TABLE "fundraising_campaign" (
    "id" TEXT NOT NULL,
    "campaignKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "companyLabel" TEXT,
    "companyNodeId" TEXT,
    "fundraisingObjectiveId" TEXT NOT NULL,
    "proposedTargetAmountAud" INTEGER,
    "stage" TEXT,
    "proposedInstrument" TEXT,
    "proposedTermsJson" JSONB,
    "targetMarketsJson" JSONB,
    "targetInvestorRegionsJson" JSONB,
    "ownerUserId" TEXT,
    "state" TEXT NOT NULL DEFAULT 'PREPARING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "fundraising_campaign_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "fundraising_campaign_campaignKey_key" ON "fundraising_campaign"("campaignKey");
CREATE INDEX "fundraising_campaign_state_idx" ON "fundraising_campaign"("state");
CREATE INDEX "fundraising_campaign_fundraisingObjectiveId_idx" ON "fundraising_campaign"("fundraisingObjectiveId");

CREATE TABLE "fundraising_campaign_target" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "catalogId" TEXT,
    "investorName" TEXT NOT NULL,
    "investorNodeId" TEXT,
    "companyNodeId" TEXT,
    "marketMatchPairKey" TEXT,
    "lifecycle" TEXT NOT NULL DEFAULT 'TARGET',
    "lifecycleHistoryJson" JSONB,
    "assessmentsJson" JSONB,
    "dossierJson" JSONB,
    "handoffJson" JSONB,
    "unresolvedGapsJson" JSONB,
    "admittingOperatorId" TEXT,
    "admittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "fundraising_campaign_target_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "fundraising_campaign_target_campaignId_catalogId_key" ON "fundraising_campaign_target"("campaignId", "catalogId");
CREATE UNIQUE INDEX "fundraising_campaign_target_campaignId_investorNodeId_key" ON "fundraising_campaign_target"("campaignId", "investorNodeId");
CREATE INDEX "fundraising_campaign_target_lifecycle_idx" ON "fundraising_campaign_target"("lifecycle");
CREATE INDEX "fundraising_campaign_target_investorNodeId_idx" ON "fundraising_campaign_target"("investorNodeId");
ALTER TABLE "fundraising_campaign_target" ADD CONSTRAINT "fundraising_campaign_target_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "fundraising_campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "investor_research_gap" (
    "id" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "whyItMatters" TEXT NOT NULL,
    "currentEvidenceState" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "requestedResearch" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "provenanceJson" JSONB,
    "resolutionJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    CONSTRAINT "investor_research_gap_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "investor_research_gap_status_idx" ON "investor_research_gap"("status");
CREATE INDEX "investor_research_gap_field_idx" ON "investor_research_gap"("field");
ALTER TABLE "investor_research_gap" ADD CONSTRAINT "investor_research_gap_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "fundraising_campaign_target"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "fundraising_document" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "version" TEXT NOT NULL DEFAULT 'v1',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "visibility" TEXT NOT NULL DEFAULT 'INTERNAL',
    "evidenceStatus" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "contentRef" TEXT,
    "metadataJson" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "fundraising_document_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "fundraising_document_category_idx" ON "fundraising_document"("category");
CREATE INDEX "fundraising_document_status_idx" ON "fundraising_document"("status");
ALTER TABLE "fundraising_document" ADD CONSTRAINT "fundraising_document_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "fundraising_campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "fundraising_outreach_draft" (
    "id" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "draftType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "bodyText" TEXT NOT NULL,
    "markedAsAi" BOOLEAN NOT NULL DEFAULT true,
    "approvedAt" TIMESTAMP(3),
    "approvedBy" TEXT,
    "metadataJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "fundraising_outreach_draft_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "fundraising_outreach_draft_status_idx" ON "fundraising_outreach_draft"("status");
CREATE INDEX "fundraising_outreach_draft_draftType_idx" ON "fundraising_outreach_draft"("draftType");
ALTER TABLE "fundraising_outreach_draft" ADD CONSTRAINT "fundraising_outreach_draft_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "fundraising_campaign_target"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "fundraising_campaign_event" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "targetId" TEXT,
    "eventType" TEXT NOT NULL,
    "actorId" TEXT,
    "payloadJson" JSONB,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "fundraising_campaign_event_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "fundraising_campaign_event_eventType_idx" ON "fundraising_campaign_event"("eventType");
CREATE INDEX "fundraising_campaign_event_occurredAt_idx" ON "fundraising_campaign_event"("occurredAt");
ALTER TABLE "fundraising_campaign_event" ADD CONSTRAINT "fundraising_campaign_event_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "fundraising_campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
