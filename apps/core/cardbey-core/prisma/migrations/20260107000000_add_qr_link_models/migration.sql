-- CreateEnum: QrTargetType
CREATE TABLE "_QrTargetType" (
    "A" TEXT NOT NULL PRIMARY KEY
);

INSERT INTO "_QrTargetType" ("A") VALUES
    ('STORE'),
    ('PRODUCT'),
    ('PROMO'),
    ('URL');

-- CreateEnum: QrLinkStatus
CREATE TABLE "_QrLinkStatus" (
    "A" TEXT NOT NULL PRIMARY KEY
);

INSERT INTO "_QrLinkStatus" ("A") VALUES
    ('ACTIVE'),
    ('DISABLED');

-- CreateEnum: QrScanSource
CREATE TABLE "_QrScanSource" (
    "A" TEXT NOT NULL PRIMARY KEY
);

INSERT INTO "_QrScanSource" ("A") VALUES
    ('PRINT'),
    ('SCREEN'),
    ('SOCIAL'),
    ('UNKNOWN');

-- CreateTable: QrLink
CREATE TABLE "QrLink" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT,
    "targetUrl" TEXT,
    "promoId" TEXT,
    "storeId" TEXT,
    "tenantId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "meta" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable: QrScanEvent
CREATE TABLE "QrScanEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "qrLinkId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "storeId" TEXT,
    "tenantId" TEXT,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT,
    "userId" TEXT,
    "source" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "referrer" TEXT,
    "userAgent" TEXT,
    "ipHash" TEXT,
    "locale" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "QrScanEvent_qrLinkId_fkey" FOREIGN KEY ("qrLinkId") REFERENCES "QrLink" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "QrLink_code_key" ON "QrLink"("code");

-- CreateIndex
CREATE INDEX "QrLink_storeId_targetType_idx" ON "QrLink"("storeId", "targetType");

-- CreateIndex
CREATE INDEX "QrLink_tenantId_idx" ON "QrLink"("tenantId");

-- CreateIndex
CREATE INDEX "QrLink_status_idx" ON "QrLink"("status");

-- CreateIndex
CREATE INDEX "QrLink_promoId_idx" ON "QrLink"("promoId");

-- CreateIndex
CREATE INDEX "QrScanEvent_qrLinkId_createdAt_idx" ON "QrScanEvent"("qrLinkId", "createdAt");

-- CreateIndex
CREATE INDEX "QrScanEvent_storeId_createdAt_idx" ON "QrScanEvent"("storeId", "createdAt");

-- CreateIndex
CREATE INDEX "QrScanEvent_code_createdAt_idx" ON "QrScanEvent"("code", "createdAt");

-- CreateIndex
CREATE INDEX "QrScanEvent_tenantId_createdAt_idx" ON "QrScanEvent"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "QrScanEvent_targetType_createdAt_idx" ON "QrScanEvent"("targetType", "createdAt");

