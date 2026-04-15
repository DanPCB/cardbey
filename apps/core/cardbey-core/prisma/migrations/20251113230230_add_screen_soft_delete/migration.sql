-- AlterTable
ALTER TABLE "Screen" ADD COLUMN "deletedAt" DATETIME;
CREATE INDEX "Screen_deletedAt_idx" ON "Screen"("deletedAt");
