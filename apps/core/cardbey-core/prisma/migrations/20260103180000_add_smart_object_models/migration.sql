-- CreateTable: SmartObject - Stable QR code routing for print bags
CREATE TABLE "SmartObject" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "publicCode" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "productId" TEXT,
    "type" TEXT NOT NULL DEFAULT 'print_bag',
    "status" TEXT NOT NULL DEFAULT 'active',
    "qrUrl" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable: SmartObjectActivePromo - Maps SmartObject to current active PromoInstance
CREATE TABLE "SmartObjectActivePromo" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "smartObjectId" TEXT NOT NULL,
    "promoId" TEXT NOT NULL,
    "promoType" TEXT NOT NULL DEFAULT 'instance',
    "activatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SmartObjectActivePromo_smartObjectId_fkey" FOREIGN KEY ("smartObjectId") REFERENCES "SmartObject" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable: SmartObjectScan - Logs QR code scans for analytics
CREATE TABLE "SmartObjectScan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "smartObjectId" TEXT NOT NULL,
    "scannedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userAgent" TEXT,
    "ipHash" TEXT,
    "referrer" TEXT,
    "promoId" TEXT,
    CONSTRAINT "SmartObjectScan_smartObjectId_fkey" FOREIGN KEY ("smartObjectId") REFERENCES "SmartObject" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "SmartObject_publicCode_key" ON "SmartObject"("publicCode");

-- CreateIndex
CREATE INDEX "SmartObject_publicCode_idx" ON "SmartObject"("publicCode");

-- CreateIndex
CREATE INDEX "SmartObject_storeId_idx" ON "SmartObject"("storeId");

-- CreateIndex
CREATE INDEX "SmartObject_productId_idx" ON "SmartObject"("productId");

-- CreateIndex
CREATE INDEX "SmartObject_status_idx" ON "SmartObject"("status");

-- CreateIndex
CREATE UNIQUE INDEX "SmartObjectActivePromo_smartObjectId_key" ON "SmartObjectActivePromo"("smartObjectId");

-- CreateIndex
CREATE INDEX "SmartObjectActivePromo_promoId_idx" ON "SmartObjectActivePromo"("promoId");

-- CreateIndex
CREATE INDEX "SmartObjectActivePromo_smartObjectId_idx" ON "SmartObjectActivePromo"("smartObjectId");

-- CreateIndex
CREATE INDEX "SmartObjectScan_smartObjectId_idx" ON "SmartObjectScan"("smartObjectId");

-- CreateIndex
CREATE INDEX "SmartObjectScan_scannedAt_idx" ON "SmartObjectScan"("scannedAt");

-- CreateIndex
CREATE INDEX "SmartObjectScan_promoId_idx" ON "SmartObjectScan"("promoId");



















