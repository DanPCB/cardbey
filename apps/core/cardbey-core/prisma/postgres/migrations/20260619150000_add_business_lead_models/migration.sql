-- Store Business Growth Center (postgres)

CREATE TABLE IF NOT EXISTS "BusinessLead" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "ownerId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "spaceId" TEXT,
  "name" TEXT NOT NULL,
  "email" TEXT,
  "phone" TEXT,
  "source" TEXT,
  "status" TEXT NOT NULL DEFAULT 'new',
  "tags" TEXT,
  "lastContactedAt" TIMESTAMP(3),
  "consentStatus" TEXT NOT NULL DEFAULT 'unknown',
  "notes" TEXT,
  "visitCount" INTEGER NOT NULL DEFAULT 0,
  "interestedAt" TIMESTAMP(3),
  "followUpDueAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

CREATE INDEX IF NOT EXISTS "BusinessLead_ownerId_idx" ON "BusinessLead"("ownerId");
CREATE INDEX IF NOT EXISTS "BusinessLead_storeId_idx" ON "BusinessLead"("storeId");
CREATE INDEX IF NOT EXISTS "BusinessLead_email_idx" ON "BusinessLead"("email");
CREATE INDEX IF NOT EXISTS "BusinessLead_status_idx" ON "BusinessLead"("status");
CREATE UNIQUE INDEX IF NOT EXISTS "BusinessLead_storeId_email_key" ON "BusinessLead"("storeId", "email");

CREATE TABLE IF NOT EXISTS "StoreOutreachCampaign" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "ownerId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
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
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3)
);

CREATE INDEX IF NOT EXISTS "StoreOutreachCampaign_storeId_idx" ON "StoreOutreachCampaign"("storeId");

CREATE TABLE IF NOT EXISTS "StoreLeadActivity" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "leadId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "message" TEXT,
  "metadata" TEXT,
  "createdBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StoreLeadActivity_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "BusinessLead"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "StoreLeadActivity_leadId_idx" ON "StoreLeadActivity"("leadId");
CREATE INDEX IF NOT EXISTS "StoreLeadActivity_storeId_idx" ON "StoreLeadActivity"("storeId");
