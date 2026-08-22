-- Additive only: ContentEditProposal (Phase 3 content editing bridge).
-- Does not alter Business, DraftStore, or Shows storage.

CREATE TABLE "ContentEditProposal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "actorId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "draftId" TEXT,
    "revisionId" TEXT,
    "contentType" TEXT NOT NULL,
    "contentItemId" TEXT NOT NULL,
    "scopedFieldsJson" TEXT NOT NULL,
    "baseFingerprint" TEXT NOT NULL,
    "baseUpdatedAt" TEXT,
    "proposedPatchJson" TEXT NOT NULL,
    "beforeSnapshotJson" TEXT NOT NULL,
    "afterSnapshotJson" TEXT NOT NULL,
    "providerMethod" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "acceptedAt" DATETIME,
    "discardedAt" DATETIME,
    "appliedRevisionId" TEXT,
    "adminReason" TEXT,
    "correlationId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE INDEX "ContentEditProposal_storeId_status_createdAt_idx" ON "ContentEditProposal"("storeId", "status", "createdAt");
CREATE INDEX "ContentEditProposal_actorId_createdAt_idx" ON "ContentEditProposal"("actorId", "createdAt");
CREATE INDEX "ContentEditProposal_contentType_contentItemId_status_idx" ON "ContentEditProposal"("contentType", "contentItemId", "status");
CREATE INDEX "ContentEditProposal_expiresAt_idx" ON "ContentEditProposal"("expiresAt");
CREATE INDEX "ContentEditProposal_correlationId_idx" ON "ContentEditProposal"("correlationId");
