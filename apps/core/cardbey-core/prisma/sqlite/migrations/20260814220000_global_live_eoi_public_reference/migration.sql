-- Global Live EOI: opaque public reference + confirmation delivery status + userId index
-- SQLite: add columns, backfill unique references, then unique index.

ALTER TABLE "GlobalLiveEoiRegistration" ADD COLUMN "publicReference" TEXT;
ALTER TABLE "GlobalLiveEoiRegistration" ADD COLUMN "confirmationEmailStatus" TEXT;
ALTER TABLE "GlobalLiveEoiRegistration" ADD COLUMN "confirmationSentAt" DATETIME;

UPDATE "GlobalLiveEoiRegistration"
SET "publicReference" = 'GL' || lower(hex(randomblob(6)))
WHERE "publicReference" IS NULL OR "publicReference" = '';

CREATE UNIQUE INDEX "GlobalLiveEoiRegistration_publicReference_key" ON "GlobalLiveEoiRegistration"("publicReference");
CREATE INDEX "GlobalLiveEoiRegistration_userId_idx" ON "GlobalLiveEoiRegistration"("userId");
CREATE INDEX "GlobalLiveEoiRegistration_emailNormalized_idx" ON "GlobalLiveEoiRegistration"("emailNormalized");
