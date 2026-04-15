-- AlterTable
ALTER TABLE "Business" ADD COLUMN "generationStatus" TEXT DEFAULT 'idle';
ALTER TABLE "Business" ADD COLUMN "lastGeneratedAt" DATETIME;
