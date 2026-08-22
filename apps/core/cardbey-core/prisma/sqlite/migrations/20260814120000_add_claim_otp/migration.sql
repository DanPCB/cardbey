-- CreateTable
CREATE TABLE IF NOT EXISTS "claim_otp" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "seedId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "recipientEmail" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "userId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL,
    "usedAt" DATETIME,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "lockedAt" DATETIME,
    "lastSentAt" DATETIME
);

CREATE INDEX IF NOT EXISTS "claim_otp_seedId_email_createdAt_idx" ON "claim_otp"("seedId", "email", "createdAt");
CREATE INDEX IF NOT EXISTS "claim_otp_seedId_createdAt_idx" ON "claim_otp"("seedId", "createdAt");
CREATE INDEX IF NOT EXISTS "claim_otp_expiresAt_idx" ON "claim_otp"("expiresAt");
