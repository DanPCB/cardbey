-- Add ownerUserId and guestSessionId to DraftStore (for claim flow and orchestra/start).
-- Safe if columns already exist (e.g. from db push): run migrate resolve --applied if needed.
ALTER TABLE "DraftStore" ADD COLUMN "ownerUserId" TEXT;
ALTER TABLE "DraftStore" ADD COLUMN "guestSessionId" TEXT;
CREATE INDEX "DraftStore_ownerUserId_idx" ON "DraftStore"("ownerUserId");
CREATE INDEX "DraftStore_guestSessionId_idx" ON "DraftStore"("guestSessionId");
