-- AlterTable
ALTER TABLE "Business" ADD COLUMN "address" TEXT;
ALTER TABLE "Business" ADD COLUMN "country" TEXT;
ALTER TABLE "Business" ADD COLUMN "lat" REAL;
ALTER TABLE "Business" ADD COLUMN "lng" REAL;
ALTER TABLE "Business" ADD COLUMN "phone" TEXT;
ALTER TABLE "Business" ADD COLUMN "postcode" TEXT;
ALTER TABLE "Business" ADD COLUMN "suburb" TEXT;
ALTER TABLE "Business" ADD COLUMN "tradingHours" JSONB;
