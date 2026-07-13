-- Loyalty card topology persistence (rule + visual layout)

ALTER TABLE "LoyaltyProgram" ADD COLUMN "ruleJson" TEXT;
ALTER TABLE "LoyaltyProgram" ADD COLUMN "cardTopologyJson" TEXT;
ALTER TABLE "LoyaltyProgram" ADD COLUMN "layoutSource" TEXT;
ALTER TABLE "LoyaltyProgram" ADD COLUMN "layoutConfidence" REAL;
ALTER TABLE "LoyaltyProgram" ADD COLUMN "layoutReviewedAt" DATETIME;
ALTER TABLE "LoyaltyProgram" ADD COLUMN "layoutReviewedBy" TEXT;
