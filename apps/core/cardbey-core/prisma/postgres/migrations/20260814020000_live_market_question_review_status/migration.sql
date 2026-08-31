-- Host participant workspace: question review status (no guest/contact fields)
ALTER TABLE "LiveMarketParticipantRegistration" ADD COLUMN IF NOT EXISTS "questionReviewStatus" TEXT;
CREATE INDEX IF NOT EXISTS "LiveMarketParticipantRegistration_sessionId_questionReviewStatus_idx" ON "LiveMarketParticipantRegistration"("sessionId", "questionReviewStatus");
