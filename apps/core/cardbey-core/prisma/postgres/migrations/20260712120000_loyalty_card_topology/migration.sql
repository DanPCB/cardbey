-- Loyalty card topology persistence (rule + visual layout)

ALTER TABLE "LoyaltyProgram" ADD COLUMN IF NOT EXISTS "ruleJson" JSONB;
ALTER TABLE "LoyaltyProgram" ADD COLUMN IF NOT EXISTS "cardTopologyJson" JSONB;
ALTER TABLE "LoyaltyProgram" ADD COLUMN IF NOT EXISTS "layoutSource" TEXT;
ALTER TABLE "LoyaltyProgram" ADD COLUMN IF NOT EXISTS "layoutConfidence" DOUBLE PRECISION;
ALTER TABLE "LoyaltyProgram" ADD COLUMN IF NOT EXISTS "layoutReviewedAt" TIMESTAMP(3);
ALTER TABLE "LoyaltyProgram" ADD COLUMN IF NOT EXISTS "layoutReviewedBy" TEXT;
