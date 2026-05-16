/*
  Warnings:

  - You are about to drop the `SmartObjectActivePromo` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `SmartObjectScan` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the column `qrUrl` on the `SmartObject` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[userId]` on the table `Business` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "Business_userId_idx";

-- DropIndex
DROP INDEX "SmartObjectScan_promoId_idx";

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "SmartObjectActivePromo";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "SmartObjectScan";
PRAGMA foreign_keys=on;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_SmartObject" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "publicCode" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "productId" TEXT,
    "type" TEXT NOT NULL DEFAULT 'print_bag',
    "status" TEXT NOT NULL DEFAULT 'active',
    "activePromoId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_SmartObject" ("createdAt", "id", "productId", "publicCode", "status", "storeId", "type", "updatedAt") SELECT "createdAt", "id", "productId", "publicCode", "status", "storeId", "type", "updatedAt" FROM "SmartObject";
DROP TABLE "SmartObject";
ALTER TABLE "new_SmartObject" RENAME TO "SmartObject";
CREATE UNIQUE INDEX "SmartObject_publicCode_key" ON "SmartObject"("publicCode");
CREATE INDEX "SmartObject_storeId_idx" ON "SmartObject"("storeId");
CREATE INDEX "SmartObject_publicCode_idx" ON "SmartObject"("publicCode");
CREATE INDEX "SmartObject_status_idx" ON "SmartObject"("status");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Business_userId_key" ON "Business"("userId");
