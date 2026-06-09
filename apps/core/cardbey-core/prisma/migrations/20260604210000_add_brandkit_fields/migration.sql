-- BrandKit columns on Business and DraftStore (nullable)
ALTER TABLE "Business" ADD COLUMN "brandTone" TEXT;
ALTER TABLE "Business" ADD COLUMN "brandStyle" TEXT;
ALTER TABLE "Business" ADD COLUMN "brandColors" TEXT;

ALTER TABLE "DraftStore" ADD COLUMN "brandTone" TEXT;
ALTER TABLE "DraftStore" ADD COLUMN "brandStyle" TEXT;
ALTER TABLE "DraftStore" ADD COLUMN "brandColors" TEXT;
