-- Global Live EOI: additive server-side consent evidence columns (nullable; no backfill).

ALTER TABLE "GlobalLiveEoiRegistration" ADD COLUMN IF NOT EXISTS "consentVersion" TEXT;
ALTER TABLE "GlobalLiveEoiRegistration" ADD COLUMN IF NOT EXISTS "privacyVersion" TEXT;
ALTER TABLE "GlobalLiveEoiRegistration" ADD COLUMN IF NOT EXISTS "termsVersion" TEXT;
ALTER TABLE "GlobalLiveEoiRegistration" ADD COLUMN IF NOT EXISTS "consentLocale" TEXT;
ALTER TABLE "GlobalLiveEoiRegistration" ADD COLUMN IF NOT EXISTS "consentContext" TEXT;
ALTER TABLE "GlobalLiveEoiRegistration" ADD COLUMN IF NOT EXISTS "consentTextHash" TEXT;
