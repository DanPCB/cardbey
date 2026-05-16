-- AlterTable
ALTER TABLE "DraftStore" ADD COLUMN "generationRunId" TEXT;

-- CreateUniqueIndex
CREATE UNIQUE INDEX "DraftStore_generationRunId_key" ON "DraftStore"("generationRunId");
