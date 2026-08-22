-- CreateTable
CREATE TABLE IF NOT EXISTS "claim_otp" (
    "id" TEXT NOT NULL,
    "seedId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "recipientEmail" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "lockedAt" TIMESTAMP(3),
    "lastSentAt" TIMESTAMP(3),

    CONSTRAINT "claim_otp_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "claim_otp_seedId_email_createdAt_idx" ON "claim_otp"("seedId", "email", "createdAt");
CREATE INDEX "claim_otp_seedId_createdAt_idx" ON "claim_otp"("seedId", "createdAt");
CREATE INDEX "claim_otp_expiresAt_idx" ON "claim_otp"("expiresAt");
