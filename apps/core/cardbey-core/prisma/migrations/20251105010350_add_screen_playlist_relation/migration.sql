-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Screen" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "location" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OFFLINE',
    "lastSeenAt" DATETIME,
    "pairingCode" TEXT NOT NULL,
    "assignedPlaylistId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Screen_assignedPlaylistId_fkey" FOREIGN KEY ("assignedPlaylistId") REFERENCES "Playlist" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Screen" ("createdAt", "id", "lastSeenAt", "location", "name", "pairingCode", "status", "updatedAt") SELECT "createdAt", "id", "lastSeenAt", "location", "name", "pairingCode", "status", "updatedAt" FROM "Screen";
DROP TABLE "Screen";
ALTER TABLE "new_Screen" RENAME TO "Screen";
CREATE UNIQUE INDEX "Screen_pairingCode_key" ON "Screen"("pairingCode");
CREATE INDEX "Screen_status_idx" ON "Screen"("status");
CREATE INDEX "Screen_lastSeenAt_idx" ON "Screen"("lastSeenAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
