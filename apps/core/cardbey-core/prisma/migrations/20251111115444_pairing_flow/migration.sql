-- CreateTable
CREATE TABLE "PairCode" (
    "code" TEXT NOT NULL PRIMARY KEY,
    "fingerprint" TEXT,
    "screenId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "issuedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PairCode_screenId_fkey" FOREIGN KEY ("screenId") REFERENCES "Screen" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Screen" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "location" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OFFLINE',
    "statusText" TEXT NOT NULL DEFAULT 'new',
    "fingerprint" TEXT,
    "paired" BOOLEAN NOT NULL DEFAULT false,
    "tokenHash" TEXT,
    "lastSeenAt" DATETIME,
    "pairingCode" TEXT NOT NULL,
    "assignedPlaylistId" TEXT,
    "currentAsset" TEXT,
    "currentPlaylistId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Screen_assignedPlaylistId_fkey" FOREIGN KEY ("assignedPlaylistId") REFERENCES "Playlist" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Screen" ("assignedPlaylistId", "createdAt", "currentAsset", "currentPlaylistId", "id", "lastSeenAt", "location", "name", "pairingCode", "status", "updatedAt") SELECT "assignedPlaylistId", "createdAt", "currentAsset", "currentPlaylistId", "id", "lastSeenAt", "location", "name", "pairingCode", "status", "updatedAt" FROM "Screen";
DROP TABLE "Screen";
ALTER TABLE "new_Screen" RENAME TO "Screen";
CREATE UNIQUE INDEX "Screen_fingerprint_key" ON "Screen"("fingerprint");
CREATE UNIQUE INDEX "Screen_pairingCode_key" ON "Screen"("pairingCode");
CREATE INDEX "Screen_status_idx" ON "Screen"("status");
CREATE INDEX "Screen_lastSeenAt_idx" ON "Screen"("lastSeenAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "PairCode_fingerprint_idx" ON "PairCode"("fingerprint");

-- CreateIndex
CREATE INDEX "PairCode_screenId_idx" ON "PairCode"("screenId");

-- CreateIndex
CREATE INDEX "PairCode_status_idx" ON "PairCode"("status");

-- CreateIndex
CREATE INDEX "PairCode_expiresAt_idx" ON "PairCode"("expiresAt");
