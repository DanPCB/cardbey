-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_DraftStore" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "mode" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "input" JSONB NOT NULL,
    "preview" JSONB,
    "error" TEXT,
    "committedAt" DATETIME,
    "committedStoreId" TEXT,
    "committedUserId" TEXT,
    "ipHash" TEXT,
    "userAgent" TEXT
);
INSERT INTO "new_DraftStore" ("committedStoreId", "committedUserId", "createdAt", "error", "expiresAt", "id", "input", "ipHash", "mode", "preview", "status", "updatedAt", "userAgent") SELECT "committedStoreId", "committedUserId", "createdAt", "error", "expiresAt", "id", "input", "ipHash", "mode", "preview", "status", "updatedAt", "userAgent" FROM "DraftStore";
DROP TABLE "DraftStore";
ALTER TABLE "new_DraftStore" RENAME TO "DraftStore";
CREATE INDEX "DraftStore_expiresAt_idx" ON "DraftStore"("expiresAt");
CREATE INDEX "DraftStore_status_idx" ON "DraftStore"("status");
CREATE INDEX "DraftStore_createdAt_idx" ON "DraftStore"("createdAt");
CREATE INDEX "DraftStore_committedStoreId_idx" ON "DraftStore"("committedStoreId");
CREATE INDEX "DraftStore_committedUserId_idx" ON "DraftStore"("committedUserId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
