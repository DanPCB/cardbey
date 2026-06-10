-- Phase 10 — Suitcase account knowledge vault
CREATE TABLE IF NOT EXISTS "suitcase_items" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerId" TEXT NOT NULL,
    "spaceId" TEXT,
    "storeId" TEXT,
    "missionId" TEXT,
    "sourceType" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "summary" TEXT,
    "tagsJson" TEXT NOT NULL DEFAULT '[]',
    "metadataJson" TEXT NOT NULL DEFAULT '{}',
    "fileUrl" TEXT,
    "thumbnailUrl" TEXT,
    "payloadJson" TEXT,
    "visibility" TEXT NOT NULL DEFAULT 'private',
    "embeddingStatus" TEXT NOT NULL DEFAULT 'pending',
    "idempotencyKey" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "suitcase_items_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "suitcase_items_idempotencyKey_key" ON "suitcase_items"("idempotencyKey");
CREATE INDEX IF NOT EXISTS "suitcase_items_ownerId_createdAt_idx" ON "suitcase_items"("ownerId", "createdAt");
CREATE INDEX IF NOT EXISTS "suitcase_items_ownerId_storeId_idx" ON "suitcase_items"("ownerId", "storeId");
CREATE INDEX IF NOT EXISTS "suitcase_items_ownerId_sourceType_idx" ON "suitcase_items"("ownerId", "sourceType");
CREATE INDEX IF NOT EXISTS "suitcase_items_ownerId_missionId_idx" ON "suitcase_items"("ownerId", "missionId");
CREATE INDEX IF NOT EXISTS "suitcase_items_ownerId_spaceId_idx" ON "suitcase_items"("ownerId", "spaceId");
