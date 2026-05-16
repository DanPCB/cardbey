-- CreateTable
CREATE TABLE "MIEntity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productId" TEXT NOT NULL,
    "productType" TEXT NOT NULL,
    "mediaType" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "previewUrl" TEXT,
    "dimensions" TEXT,
    "orientation" TEXT,
    "durationSec" INTEGER,
    "createdByUserId" TEXT NOT NULL,
    "createdByEngine" TEXT NOT NULL,
    "sourceProjectId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tenantId" TEXT,
    "storeId" TEXT,
    "campaignId" TEXT,
    "creativeAssetId" TEXT,
    "reportId" TEXT,
    "screenItemId" TEXT,
    "packagingId" TEXT,
    "miBrain" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "validFrom" DATETIME,
    "validTo" DATETIME,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "MIEntity_productId_idx" ON "MIEntity"("productId");

-- CreateIndex
CREATE INDEX "MIEntity_productType_idx" ON "MIEntity"("productType");

-- CreateIndex
CREATE INDEX "MIEntity_tenantId_idx" ON "MIEntity"("tenantId");

-- CreateIndex
CREATE INDEX "MIEntity_storeId_idx" ON "MIEntity"("storeId");

-- CreateIndex
CREATE INDEX "MIEntity_campaignId_idx" ON "MIEntity"("campaignId");

-- CreateIndex
CREATE INDEX "MIEntity_creativeAssetId_idx" ON "MIEntity"("creativeAssetId");

-- CreateIndex
CREATE INDEX "MIEntity_reportId_idx" ON "MIEntity"("reportId");

-- CreateIndex
CREATE INDEX "MIEntity_screenItemId_idx" ON "MIEntity"("screenItemId");

-- CreateIndex
CREATE INDEX "MIEntity_status_idx" ON "MIEntity"("status");

-- CreateIndex
CREATE INDEX "MIEntity_createdByUserId_idx" ON "MIEntity"("createdByUserId");

-- CreateIndex
CREATE UNIQUE INDEX "MIEntity_creativeAssetId_key" ON "MIEntity"("creativeAssetId");

-- CreateIndex
CREATE UNIQUE INDEX "MIEntity_reportId_key" ON "MIEntity"("reportId");

-- CreateIndex
CREATE UNIQUE INDEX "MIEntity_screenItemId_key" ON "MIEntity"("screenItemId");
