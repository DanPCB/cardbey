-- Document topology revision history (Phase 2)
CREATE TABLE "DocumentTopologyRevision" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "documentId" TEXT NOT NULL,
    "documentType" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "source" TEXT NOT NULL,
    "topologyJson" TEXT NOT NULL,
    "changesJson" TEXT,
    "confidence" REAL,
    "approved" BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX "DocumentTopologyRevision_documentId_idx" ON "DocumentTopologyRevision"("documentId");
CREATE INDEX "DocumentTopologyRevision_documentType_idx" ON "DocumentTopologyRevision"("documentType");
CREATE INDEX "DocumentTopologyRevision_createdAt_idx" ON "DocumentTopologyRevision"("createdAt");
