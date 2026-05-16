-- AlterTable
ALTER TABLE "Media" ADD COLUMN "missingFile" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "Media_missingFile_idx" ON "Media"("missingFile");

