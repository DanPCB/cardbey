-- Global Live EOI: additive server-side consent evidence columns (nullable; no backfill).

ALTER TABLE "GlobalLiveEoiRegistration" ADD COLUMN "consentVersion" TEXT;
ALTER TABLE "GlobalLiveEoiRegistration" ADD COLUMN "privacyVersion" TEXT;
ALTER TABLE "GlobalLiveEoiRegistration" ADD COLUMN "termsVersion" TEXT;
ALTER TABLE "GlobalLiveEoiRegistration" ADD COLUMN "consentLocale" TEXT;
ALTER TABLE "GlobalLiveEoiRegistration" ADD COLUMN "consentContext" TEXT;
ALTER TABLE "GlobalLiveEoiRegistration" ADD COLUMN "consentTextHash" TEXT;
