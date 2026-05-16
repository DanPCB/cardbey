-- CreateTable
CREATE TABLE "PromoDeployment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "publicId" TEXT NOT NULL,
    "instanceId" TEXT NOT NULL,
    "tenantId" TEXT,
    "storeId" TEXT,
    "qrScans" INTEGER NOT NULL DEFAULT 0,
    "landingViews" INTEGER NOT NULL DEFAULT 0,
    "registerClicks" INTEGER NOT NULL DEFAULT 0,
    "registrations" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "PromoDeployment_publicId_key" ON "PromoDeployment"("publicId");

-- CreateIndex
CREATE INDEX "PromoDeployment_instanceId_idx" ON "PromoDeployment"("instanceId");

-- CreateIndex
CREATE INDEX "PromoDeployment_publicId_idx" ON "PromoDeployment"("publicId");

-- CreateIndex
CREATE INDEX "PromoDeployment_tenantId_idx" ON "PromoDeployment"("tenantId");

-- CreateIndex
CREATE INDEX "PromoDeployment_storeId_idx" ON "PromoDeployment"("storeId");

-- CreateIndex
CREATE INDEX "PromoDeployment_tenantId_storeId_idx" ON "PromoDeployment"("tenantId", "storeId");
