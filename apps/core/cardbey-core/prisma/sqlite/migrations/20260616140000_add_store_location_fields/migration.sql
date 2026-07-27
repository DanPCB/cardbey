-- Store location fields for OpenStreetMap geocoding (Business + DraftStore)

ALTER TABLE "Business" ADD COLUMN "addressLine2" TEXT;
ALTER TABLE "Business" ADD COLUMN "city" TEXT;
ALTER TABLE "Business" ADD COLUMN "formattedAddress" TEXT;
ALTER TABLE "Business" ADD COLUMN "locationSource" TEXT;
ALTER TABLE "Business" ADD COLUMN "locationConfidence" TEXT;
ALTER TABLE "Business" ADD COLUMN "osmPlaceId" TEXT;

ALTER TABLE "DraftStore" ADD COLUMN "addressLine2" TEXT;
ALTER TABLE "DraftStore" ADD COLUMN "city" TEXT;
ALTER TABLE "DraftStore" ADD COLUMN "formattedAddress" TEXT;
ALTER TABLE "DraftStore" ADD COLUMN "locationSource" TEXT;
ALTER TABLE "DraftStore" ADD COLUMN "locationConfidence" TEXT;
ALTER TABLE "DraftStore" ADD COLUMN "osmPlaceId" TEXT;
