-- Host participant workspace: question review status (no guest/contact fields)
ALTER TABLE "LiveMarketParticipantRegistration" ADD COLUMN "questionReviewStatus" TEXT;
CREATE INDEX "LiveMarketParticipantRegistration_sessionId_questionReviewStatus_idx" ON "LiveMarketParticipantRegistration"("sessionId", "questionReviewStatus");
