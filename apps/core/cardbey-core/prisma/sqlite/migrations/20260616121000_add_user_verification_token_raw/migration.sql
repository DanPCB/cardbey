-- Add raw verification token column (SQLite dev/test).
-- Used for resend flows; cleared on confirm.
ALTER TABLE "User" ADD COLUMN "verificationTokenRaw" TEXT;

