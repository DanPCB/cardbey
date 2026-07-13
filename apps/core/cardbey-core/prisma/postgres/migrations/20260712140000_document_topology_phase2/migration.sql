-- Document topology revision history (Phase 2)
CREATE TABLE IF NOT EXISTS "DocumentTopologyRevision" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "documentType" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "source" TEXT NOT NULL,
    "topologyJson" JSONB NOT NULL,
    "changesJson" JSONB,
    "confidence" DOUBLE PRECISION,
    "approved" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "DocumentTopologyRevision_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "DocumentTopologyRevision_documentId_idx" ON "DocumentTopologyRevision"("documentId");
CREATE INDEX IF NOT EXISTS "DocumentTopologyRevision_documentType_idx" ON "DocumentTopologyRevision"("documentType");
CREATE INDEX IF NOT EXISTS "DocumentTopologyRevision_createdAt_idx" ON "DocumentTopologyRevision"("createdAt");
