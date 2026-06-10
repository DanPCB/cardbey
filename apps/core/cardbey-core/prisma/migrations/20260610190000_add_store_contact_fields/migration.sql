-- AlterTable Business: contact fields for storefront + publish
ALTER TABLE "Business" ADD COLUMN "state" TEXT;
ALTER TABLE "Business" ADD COLUMN "email" TEXT;
ALTER TABLE "Business" ADD COLUMN "websiteUrl" TEXT;
ALTER TABLE "Business" ADD COLUMN "mapUrl" TEXT;

-- AlterTable DraftStore: scraped contact intake + publish source
ALTER TABLE "DraftStore" ADD COLUMN "phone" TEXT;
ALTER TABLE "DraftStore" ADD COLUMN "email" TEXT;
ALTER TABLE "DraftStore" ADD COLUMN "websiteUrl" TEXT;
ALTER TABLE "DraftStore" ADD COLUMN "address" TEXT;
ALTER TABLE "DraftStore" ADD COLUMN "suburb" TEXT;
ALTER TABLE "DraftStore" ADD COLUMN "state" TEXT;
ALTER TABLE "DraftStore" ADD COLUMN "postcode" TEXT;
ALTER TABLE "DraftStore" ADD COLUMN "country" TEXT;
ALTER TABLE "DraftStore" ADD COLUMN "mapUrl" TEXT;
ALTER TABLE "DraftStore" ADD COLUMN "lat" REAL;
ALTER TABLE "DraftStore" ADD COLUMN "lng" REAL;
