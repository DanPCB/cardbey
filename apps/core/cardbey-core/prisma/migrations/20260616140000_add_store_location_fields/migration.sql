-- Store location fields for OpenStreetMap geocoding (Business + DraftStore)

ALTER TABLE "Business" ADD COLUMN IF NOT EXISTS "addressLine2" TEXT;
ALTER TABLE "Business" ADD COLUMN IF NOT EXISTS "city" TEXT;
ALTER TABLE "Business" ADD COLUMN IF NOT EXISTS "formattedAddress" TEXT;
ALTER TABLE "Business" ADD COLUMN IF NOT EXISTS "locationSource" TEXT;
ALTER TABLE "Business" ADD COLUMN IF NOT EXISTS "locationConfidence" TEXT;
ALTER TABLE "Business" ADD COLUMN IF NOT EXISTS "osmPlaceId" TEXT;

ALTER TABLE "DraftStore" ADD COLUMN IF NOT EXISTS "addressLine2" TEXT;
ALTER TABLE "DraftStore" ADD COLUMN IF NOT EXISTS "city" TEXT;
ALTER TABLE "DraftStore" ADD COLUMN IF NOT EXISTS "formattedAddress" TEXT;
ALTER TABLE "DraftStore" ADD COLUMN IF NOT EXISTS "locationSource" TEXT;
ALTER TABLE "DraftStore" ADD COLUMN IF NOT EXISTS "locationConfidence" TEXT;
ALTER TABLE "DraftStore" ADD COLUMN IF NOT EXISTS "osmPlaceId" TEXT;
