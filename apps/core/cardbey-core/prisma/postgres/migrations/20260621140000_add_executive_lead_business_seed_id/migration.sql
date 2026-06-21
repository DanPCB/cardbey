-- Link ExecutiveLead to governed business_seed after Discovery promotion

ALTER TABLE "ExecutiveLead" ADD COLUMN IF NOT EXISTS "businessSeedId" TEXT;

CREATE INDEX IF NOT EXISTS "ExecutiveLead_businessSeedId_idx" ON "ExecutiveLead"("businessSeedId");
