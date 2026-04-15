/*
  Warnings:

  - You are about to drop the `MiChatMessage` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `MiChatThread` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `MiConfirmToken` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `MiIdempotency` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `MiIntent` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `MiJob` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `MiToolAudit` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `MiWorkOrder` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `SmartObject` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `SmartObjectActivePromo` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `SmartObjectScan` table. If the table is not empty, all the data it contains will be lost.
  - You are about to alter the column `contentJson` on the `MiArtifact` table. The data in that column could be lost. The data in that column will be cast from `String` to `Json`.
  - You are about to alter the column `expectedTagsJson` on the `MiArtifact` table. The data in that column could be lost. The data in that column will be cast from `String` to `Json`.
  - You are about to alter the column `semanticTagsJson` on the `MiArtifact` table. The data in that column could be lost. The data in that column will be cast from `String` to `Json`.
  - You are about to drop the column `finishedAt` on the `MiStage` table. All the data in the column will be lost.
  - You are about to alter the column `dependsOnJson` on the `MiStage` table. The data in that column could be lost. The data in that column will be cast from `String` to `Json`.
  - You are about to drop the column `publicId` on the `Product` table. All the data in the column will be lost.
  - Made the column `normalizedName` on table `Product` required. This step will fail if there are existing NULL values in that column.

*/
-- DropIndex
DROP INDEX "MiChatMessage_createdAt_idx";

-- DropIndex
DROP INDEX "MiChatMessage_threadId_idx";

-- DropIndex
DROP INDEX "MiChatThread_createdAt_idx";

-- DropIndex
DROP INDEX "MiChatThread_objectId_idx";

-- DropIndex
DROP INDEX "MiChatThread_preset_idx";

-- DropIndex
DROP INDEX "MiChatThread_userId_idx";

-- DropIndex
DROP INDEX "MiChatThread_tenantId_idx";

-- DropIndex
DROP INDEX "MiConfirmToken_expiresAt_idx";

-- DropIndex
DROP INDEX "MiConfirmToken_toolName_inputHash_idx";

-- DropIndex
DROP INDEX "MiConfirmToken_token_key";

-- DropIndex
DROP INDEX "MiIdempotency_expiresAt_idx";

-- DropIndex
DROP INDEX "MiIdempotency_toolName_keyHash_idx";

-- DropIndex
DROP INDEX "MiIdempotency_keyHash_key";

-- DropIndex
DROP INDEX "MiIntent_createdAt_idx";

-- DropIndex
DROP INDEX "MiIntent_userId_idx";

-- DropIndex
DROP INDEX "MiJob_createdAt_idx";

-- DropIndex
DROP INDEX "MiJob_currentStage_idx";

-- DropIndex
DROP INDEX "MiJob_status_idx";

-- DropIndex
DROP INDEX "MiJob_intentId_idx";

-- DropIndex
DROP INDEX "MiToolAudit_objectId_idx";

-- DropIndex
DROP INDEX "MiToolAudit_userId_createdAt_idx";

-- DropIndex
DROP INDEX "MiToolAudit_tenantId_createdAt_idx";

-- DropIndex
DROP INDEX "MiToolAudit_preset_idx";

-- DropIndex
DROP INDEX "MiToolAudit_toolName_idx";

-- DropIndex
DROP INDEX "MiWorkOrder_createdAt_idx";

-- DropIndex
DROP INDEX "MiWorkOrder_status_idx";

-- DropIndex
DROP INDEX "MiWorkOrder_threadId_idx";

-- DropIndex
DROP INDEX IF EXISTS "unique_store_product_type";

-- DropIndex
DROP INDEX IF EXISTS "SmartObject_status_idx";

-- DropIndex
DROP INDEX IF EXISTS "SmartObject_productId_idx";

-- DropIndex
DROP INDEX IF EXISTS "SmartObject_storeId_idx";

-- DropIndex
DROP INDEX IF EXISTS "SmartObject_publicCode_idx";

-- DropIndex
DROP INDEX IF EXISTS "SmartObject_publicCode_key";

-- DropIndex
DROP INDEX IF EXISTS "SmartObjectActivePromo_smartObjectId_idx";

-- DropIndex
DROP INDEX IF EXISTS "SmartObjectActivePromo_promoId_idx";

-- DropIndex
DROP INDEX IF EXISTS "SmartObjectActivePromo_smartObjectId_key";

-- DropIndex (handle both old and new index names)
DROP INDEX IF EXISTS "SmartObjectScan_timestamp_idx";
DROP INDEX IF EXISTS "SmartObjectScan_scannedAt_idx";

-- DropIndex
DROP INDEX IF EXISTS "SmartObjectScan_smartObjectId_idx";

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "MiChatMessage";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "MiChatThread";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "MiConfirmToken";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "MiIdempotency";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "MiIntent";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "MiJob";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "MiToolAudit";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "MiWorkOrder";
PRAGMA foreign_keys=on;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_MiArtifact" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobId" TEXT NOT NULL,
    "stageId" TEXT,
    "type" TEXT NOT NULL,
    "contentJson" JSONB NOT NULL,
    "expectedTagsJson" JSONB,
    "semanticTagsJson" JSONB,
    "matchScore" REAL,
    "status" TEXT NOT NULL DEFAULT 'OK',
    "provenanceAgent" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MiArtifact_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "MiGenerationJob" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MiArtifact_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "MiStage" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_MiArtifact" ("contentJson", "createdAt", "expectedTagsJson", "id", "jobId", "matchScore", "provenanceAgent", "semanticTagsJson", "stageId", "status", "type", "updatedAt") SELECT "contentJson", "createdAt", "expectedTagsJson", "id", "jobId", "matchScore", "provenanceAgent", "semanticTagsJson", "stageId", "status", "type", "updatedAt" FROM "MiArtifact";
DROP TABLE "MiArtifact";
ALTER TABLE "new_MiArtifact" RENAME TO "MiArtifact";
CREATE INDEX "MiArtifact_jobId_idx" ON "MiArtifact"("jobId");
CREATE INDEX "MiArtifact_jobId_stageId_idx" ON "MiArtifact"("jobId", "stageId");
CREATE INDEX "MiArtifact_jobId_type_idx" ON "MiArtifact"("jobId", "type");
CREATE INDEX "MiArtifact_stageId_idx" ON "MiArtifact"("stageId");
CREATE INDEX "MiArtifact_type_idx" ON "MiArtifact"("type");
CREATE INDEX "MiArtifact_status_idx" ON "MiArtifact"("status");
CREATE INDEX "MiArtifact_createdAt_idx" ON "MiArtifact"("createdAt");
CREATE TABLE "new_MiStage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "dependsOnJson" JSONB,
    "resultJson" JSONB,
    "errorJson" JSONB,
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MiStage_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "MiGenerationJob" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_MiStage" ("createdAt", "dependsOnJson", "id", "jobId", "name", "startedAt", "status", "updatedAt") SELECT "createdAt", "dependsOnJson", "id", "jobId", "name", "startedAt", "status", "updatedAt" FROM "MiStage";
DROP TABLE "MiStage";
ALTER TABLE "new_MiStage" RENAME TO "MiStage";
CREATE INDEX "MiStage_jobId_idx" ON "MiStage"("jobId");
CREATE INDEX "MiStage_jobId_status_idx" ON "MiStage"("jobId", "status");
CREATE INDEX "MiStage_jobId_name_idx" ON "MiStage"("jobId", "name");
CREATE INDEX "MiStage_name_idx" ON "MiStage"("name");
CREATE INDEX "MiStage_createdAt_idx" ON "MiStage"("createdAt");
CREATE TABLE "new_Product" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "description" TEXT,
    "translations" JSONB,
    "price" REAL,
    "currency" TEXT DEFAULT 'USD',
    "category" TEXT,
    "imageUrl" TEXT,
    "sku" TEXT,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "images" JSONB,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "likeCount" INTEGER NOT NULL DEFAULT 0,
    "hasSam3Cutout" BOOLEAN NOT NULL DEFAULT false,
    "cutoutPath" TEXT,
    "deletedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "tags" TEXT,
    CONSTRAINT "Product_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Product" ("businessId", "category", "createdAt", "currency", "cutoutPath", "deletedAt", "description", "hasSam3Cutout", "id", "imageUrl", "images", "isPublished", "likeCount", "name", "normalizedName", "price", "sku", "tags", "translations", "updatedAt", "viewCount") SELECT "businessId", "category", "createdAt", "currency", "cutoutPath", "deletedAt", "description", "hasSam3Cutout", "id", "imageUrl", "images", "isPublished", "likeCount", "name", "normalizedName", "price", "sku", "tags", "translations", "updatedAt", "viewCount" FROM "Product";
DROP TABLE "Product";
ALTER TABLE "new_Product" RENAME TO "Product";
CREATE INDEX "Product_businessId_idx" ON "Product"("businessId");
CREATE INDEX "Product_businessId_isPublished_idx" ON "Product"("businessId", "isPublished");
CREATE INDEX "Product_category_idx" ON "Product"("category");
CREATE INDEX "Product_deletedAt_idx" ON "Product"("deletedAt");
CREATE INDEX "Product_hasSam3Cutout_idx" ON "Product"("hasSam3Cutout");
CREATE UNIQUE INDEX "Product_businessId_normalizedName_key" ON "Product"("businessId", "normalizedName");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
