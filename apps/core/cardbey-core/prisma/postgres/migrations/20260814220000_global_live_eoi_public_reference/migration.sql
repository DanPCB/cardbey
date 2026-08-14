-- Global Live EOI: opaque public reference + confirmation delivery status + userId index

ALTER TABLE "GlobalLiveEoiRegistration" ADD COLUMN IF NOT EXISTS "publicReference" TEXT;
ALTER TABLE "GlobalLiveEoiRegistration" ADD COLUMN IF NOT EXISTS "confirmationEmailStatus" TEXT;
ALTER TABLE "GlobalLiveEoiRegistration" ADD COLUMN IF NOT EXISTS "confirmationSentAt" TIMESTAMP(3);

UPDATE "GlobalLiveEoiRegistration"
SET "publicReference" = 'GL' || lower(substr(md5(random()::text || id::text), 1, 12))
WHERE "publicReference" IS NULL OR "publicReference" = '';

CREATE UNIQUE INDEX IF NOT EXISTS "GlobalLiveEoiRegistration_publicReference_key" ON "GlobalLiveEoiRegistration"("publicReference");
CREATE INDEX IF NOT EXISTS "GlobalLiveEoiRegistration_userId_idx" ON "GlobalLiveEoiRegistration"("userId");
CREATE INDEX IF NOT EXISTS "GlobalLiveEoiRegistration_emailNormalized_idx" ON "GlobalLiveEoiRegistration"("emailNormalized");

ALTER TABLE "GlobalLiveEoiRegistration" ALTER COLUMN "publicReference" SET NOT NULL;
