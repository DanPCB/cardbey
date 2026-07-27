-- Guest temp Business rows: flag + optional expiry for cleanup/claim flows.
ALTER TABLE "Business" ADD COLUMN IF NOT EXISTS "isGuestDraft" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Business" ADD COLUMN IF NOT EXISTS "expiresAt" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "Business_expiresAt_idx" ON "Business"("expiresAt");
