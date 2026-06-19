-- Align growth tables with Prisma schema (idempotent)

ALTER TABLE "ExecutiveLead"
  ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "BusinessLead"
  ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX IF NOT EXISTS "ExecutiveLead_city_idx" ON "ExecutiveLead"("city");
CREATE INDEX IF NOT EXISTS "ExecutiveLead_category_idx" ON "ExecutiveLead"("category");
CREATE INDEX IF NOT EXISTS "ExecutiveLead_source_idx" ON "ExecutiveLead"("source");

CREATE INDEX IF NOT EXISTS "GrowthBatch_status_idx" ON "GrowthBatch"("status");
CREATE INDEX IF NOT EXISTS "GrowthBatch_requestedBy_idx" ON "GrowthBatch"("requestedBy");
CREATE INDEX IF NOT EXISTS "GrowthBatch_createdAt_idx" ON "GrowthBatch"("createdAt");

CREATE INDEX IF NOT EXISTS "OutreachCampaign_status_idx" ON "OutreachCampaign"("status");
CREATE INDEX IF NOT EXISTS "OutreachCampaign_createdAt_idx" ON "OutreachCampaign"("createdAt");

CREATE INDEX IF NOT EXISTS "LeadActivity_type_idx" ON "LeadActivity"("type");
CREATE INDEX IF NOT EXISTS "LeadActivity_createdAt_idx" ON "LeadActivity"("createdAt");

CREATE INDEX IF NOT EXISTS "StoreOutreachCampaign_ownerId_idx" ON "StoreOutreachCampaign"("ownerId");
CREATE INDEX IF NOT EXISTS "StoreOutreachCampaign_status_idx" ON "StoreOutreachCampaign"("status");

CREATE INDEX IF NOT EXISTS "StoreLeadActivity_type_idx" ON "StoreLeadActivity"("type");
CREATE INDEX IF NOT EXISTS "StoreLeadActivity_createdAt_idx" ON "StoreLeadActivity"("createdAt");

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'BusinessLead' AND column_name = 'tags' AND udt_name = 'text'
  ) THEN
    ALTER TABLE "BusinessLead" ALTER COLUMN "tags" TYPE JSONB USING (
      CASE
        WHEN "tags" IS NULL OR btrim("tags") = '' THEN NULL
        ELSE "tags"::jsonb
      END
    );
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'StoreOutreachCampaign' AND column_name = 'targetLeadIds' AND udt_name = 'text'
  ) THEN
    ALTER TABLE "StoreOutreachCampaign" ALTER COLUMN "targetLeadIds" TYPE JSONB USING (
      CASE
        WHEN "targetLeadIds" IS NULL OR btrim("targetLeadIds") = '' THEN NULL
        ELSE "targetLeadIds"::jsonb
      END
    );
  END IF;
END $$;
