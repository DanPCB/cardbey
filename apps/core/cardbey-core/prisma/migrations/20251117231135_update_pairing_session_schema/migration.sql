/*
  Warnings:

  - The primary key for the `PairingSession` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `deviceTempId` on the `PairingSession` table. All the data in the column will be lost.
  - You are about to drop the column `issuedAt` on the `PairingSession` table. All the data in the column will be lost.
  - You are about to drop the column `lastSeenAt` on the `PairingSession` table. All the data in the column will be lost.
  - Added the required column `fingerprint` to the `PairingSession` table without a default value. This is not possible if the table is not empty.
  - Added the required column `model` to the `PairingSession` table without a default value. This is not possible if the table is not empty.
  - Added the required column `name` to the `PairingSession` table without a default value. This is not possible if the table is not empty.
  - The required column `sessionId` was added to the `PairingSession` table with a prisma-level default value. This is not possible if the table is not empty. Please add this column as optional, then populate it before making it required.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_PairCode" (
    "code" TEXT NOT NULL PRIMARY KEY,
    "fingerprint" TEXT,
    "screenId" TEXT,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PairCode_screenId_fkey" FOREIGN KEY ("screenId") REFERENCES "Screen" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_PairCode" ("code", "createdAt", "expiresAt", "fingerprint", "screenId", "updatedAt") SELECT "code", "createdAt", "expiresAt", "fingerprint", "screenId", "updatedAt" FROM "PairCode";
DROP TABLE "PairCode";
ALTER TABLE "new_PairCode" RENAME TO "PairCode";
CREATE INDEX "PairCode_fingerprint_idx" ON "PairCode"("fingerprint");
CREATE TABLE "new_PairingSession" (
    "sessionId" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'showing_code',
    "expiresAt" DATETIME NOT NULL,
    "deviceToken" TEXT,
    "fingerprint" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "location" TEXT,
    "screenId" TEXT,
    "claimedBy" TEXT,
    "origin" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PairingSession_screenId_fkey" FOREIGN KEY ("screenId") REFERENCES "Screen" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_PairingSession" ("code", "expiresAt", "origin", "screenId", "status", "updatedAt") SELECT "code", "expiresAt", "origin", "screenId", "status", "updatedAt" FROM "PairingSession";
DROP TABLE "PairingSession";
ALTER TABLE "new_PairingSession" RENAME TO "PairingSession";
CREATE UNIQUE INDEX "PairingSession_code_key" ON "PairingSession"("code");
CREATE INDEX "PairingSession_code_idx" ON "PairingSession"("code");
CREATE INDEX "PairingSession_expiresAt_idx" ON "PairingSession"("expiresAt");
CREATE INDEX "PairingSession_status_idx" ON "PairingSession"("status");
CREATE INDEX "PairingSession_fingerprint_idx" ON "PairingSession"("fingerprint");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
