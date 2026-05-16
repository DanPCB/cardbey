-- AlterTable: Add translations to Business
ALTER TABLE "Business" ADD COLUMN "translations" TEXT;

-- AlterTable: Add translations to Product
ALTER TABLE "Product" ADD COLUMN "translations" TEXT;

-- AlterTable: Add translations to Playlist
ALTER TABLE "Playlist" ADD COLUMN "translations" TEXT;

-- AlterTable: Add translations to SignageAsset
ALTER TABLE "SignageAsset" ADD COLUMN "translations" TEXT;

-- AlterTable: Add templateId to MIEntity
ALTER TABLE "MIEntity" ADD COLUMN "templateId" TEXT;

-- CreateIndex: Add index on templateId
CREATE INDEX "MIEntity_templateId_idx" ON "MIEntity"("templateId");

-- CreateUniqueIndex: Add unique constraint on templateId
CREATE UNIQUE INDEX "MIEntity_templateId_key" ON "MIEntity"("templateId");

-- CreateUniqueIndex: Add unique constraint on packagingId
CREATE UNIQUE INDEX "MIEntity_packagingId_key" ON "MIEntity"("packagingId");

-- CreateTable: CreativeTemplate
CREATE TABLE "CreativeTemplate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT,
    "storeId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "thumbnailUrl" TEXT,
    "baseContentId" TEXT,
    "channels" TEXT NOT NULL DEFAULT '[]',
    "role" TEXT,
    "primaryIntent" TEXT,
    "orientation" TEXT,
    "minDurationS" INTEGER,
    "maxDurationS" INTEGER,
    "tags" TEXT NOT NULL DEFAULT '[]',
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "fields" TEXT,
    "aiContext" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex: CreativeTemplate indexes
CREATE INDEX "CreativeTemplate_tenantId_storeId_idx" ON "CreativeTemplate"("tenantId", "storeId");
CREATE INDEX "CreativeTemplate_role_primaryIntent_idx" ON "CreativeTemplate"("role", "primaryIntent");
CREATE INDEX "CreativeTemplate_orientation_idx" ON "CreativeTemplate"("orientation");
CREATE INDEX "CreativeTemplate_isActive_idx" ON "CreativeTemplate"("isActive");
CREATE INDEX "CreativeTemplate_isSystem_idx" ON "CreativeTemplate"("isSystem");

