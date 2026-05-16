-- AlterTable
ALTER TABLE "RagChunk" ADD COLUMN "tenantId" TEXT;

-- CreateIndex
CREATE INDEX "RagChunk_scope_tenantId_idx" ON "RagChunk"("scope", "tenantId");
