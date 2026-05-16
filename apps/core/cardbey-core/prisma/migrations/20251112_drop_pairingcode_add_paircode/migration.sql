-- Fill missing fingerprints for legacy screens
UPDATE "Screen"
SET "fingerprint" = 'LEGACY_' || REPLACE("id", '-', '')
WHERE "fingerprint" IS NULL OR TRIM("fingerprint") = '';

PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

-- Recreate PairCode table with new structure
DROP TABLE IF EXISTS "PairCode";
CREATE TABLE "PairCode" (
    "code" TEXT NOT NULL PRIMARY KEY,
    "fingerprint" TEXT,
    "screenId" TEXT,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PairCode_screenId_fkey" FOREIGN KEY ("screenId") REFERENCES "Screen" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "PairCode_fingerprint_idx" ON "PairCode"("fingerprint");

-- Recreate Screen table without obsolete columns and with required fingerprint
CREATE TABLE "new_Screen" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fingerprint" TEXT NOT NULL,
    "name" TEXT,
    "location" TEXT,
    "paired" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'OFFLINE',
    "statusText" TEXT,
    "lastSeen" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "assignedPlaylistId" TEXT,
    "currentAsset" TEXT,
    "currentPlaylistId" TEXT,
    CONSTRAINT "Screen_assignedPlaylistId_fkey" FOREIGN KEY ("assignedPlaylistId") REFERENCES "Playlist" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

INSERT INTO "new_Screen" (
    "id",
    "fingerprint",
    "name",
    "location",
    "paired",
    "status",
    "statusText",
    "lastSeen",
    "createdAt",
    "updatedAt",
    "assignedPlaylistId",
    "currentAsset",
    "currentPlaylistId"
)
SELECT
    "id",
    COALESCE(NULLIF(TRIM("fingerprint"), ''), 'LEGACY_' || REPLACE("id", '-', '')),
    "name",
    "location",
    "paired",
    "status",
    "statusText",
    "lastSeenAt",
    "createdAt",
    "updatedAt",
    "assignedPlaylistId",
    "currentAsset",
    "currentPlaylistId"
FROM "Screen";

DROP TABLE "Screen";
ALTER TABLE "new_Screen" RENAME TO "Screen";
CREATE UNIQUE INDEX "Screen_fingerprint_key" ON "Screen"("fingerprint");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

