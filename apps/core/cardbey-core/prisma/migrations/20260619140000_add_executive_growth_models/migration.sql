-- Executive Growth Command Center: Lead, GrowthBatch, OutreachCampaign, LeadActivity

CREATE TABLE IF NOT EXISTS "ExecutiveLead" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "businessName" TEXT NOT NULL,
  "ownerName" TEXT,
  "email" TEXT,
  "phone" TEXT,
  "website" TEXT,
  "category" TEXT,
  "address" TEXT,
  "addressLine2" TEXT,
  "suburb" TEXT,
  "city" TEXT,
  "state" TEXT,
  "postcode" TEXT,
  "country" TEXT,
  "lat" REAL,
  "lng" REAL,
  "source" TEXT,
  "notes" TEXT,
  "consentStatus" TEXT NOT NULL DEFAULT 'unknown',
  "leadStatus" TEXT NOT NULL DEFAULT 'new',
  "dataQualityScore" INTEGER NOT NULL DEFAULT 0,
  "draftStoreId" TEXT,
  "storeId" TEXT,
  "lastContactedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);

CREATE INDEX IF NOT EXISTS "ExecutiveLead_email_idx" ON "ExecutiveLead"("email");
CREATE INDEX IF NOT EXISTS "ExecutiveLead_leadStatus_idx" ON "ExecutiveLead"("leadStatus");
CREATE INDEX IF NOT EXISTS "ExecutiveLead_city_idx" ON "ExecutiveLead"("city");
CREATE INDEX IF NOT EXISTS "ExecutiveLead_category_idx" ON "ExecutiveLead"("category");
CREATE INDEX IF NOT EXISTS "ExecutiveLead_source_idx" ON "ExecutiveLead"("source");

CREATE TABLE IF NOT EXISTS "GrowthBatch" (
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
  "sourceLeadIds" TEXT,
  "createdStoreIds" TEXT,
  "reviewQueueIds" TEXT,
  "auditSummary" TEXT,
  "errorSummary" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" DATETIME
);

CREATE INDEX IF NOT EXISTS "GrowthBatch_status_idx" ON "GrowthBatch"("status");
CREATE INDEX IF NOT EXISTS "GrowthBatch_requestedBy_idx" ON "GrowthBatch"("requestedBy");
CREATE INDEX IF NOT EXISTS "GrowthBatch_createdAt_idx" ON "GrowthBatch"("createdAt");

CREATE TABLE IF NOT EXISTS "OutreachCampaign" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "templateId" TEXT NOT NULL,
  "templateBody" TEXT,
  "targetLeadIds" TEXT,
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

CREATE INDEX IF NOT EXISTS "OutreachCampaign_status_idx" ON "OutreachCampaign"("status");
CREATE INDEX IF NOT EXISTS "OutreachCampaign_createdAt_idx" ON "OutreachCampaign"("createdAt");

CREATE TABLE IF NOT EXISTS "LeadActivity" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "leadId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "message" TEXT,
  "metadata" TEXT,
  "createdBy" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LeadActivity_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "ExecutiveLead"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "LeadActivity_leadId_idx" ON "LeadActivity"("leadId");
CREATE INDEX IF NOT EXISTS "LeadActivity_type_idx" ON "LeadActivity"("type");
CREATE INDEX IF NOT EXISTS "LeadActivity_createdAt_idx" ON "LeadActivity"("createdAt");
