-- CreateTable: StorePromo (Phase 1 Scan & Redeem: public promo landing + QR)
CREATE TABLE "StorePromo" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "storeId" TEXT NOT NULL,
    "productId" TEXT,
    "title" TEXT NOT NULL,
    "subtitle" TEXT,
    "description" TEXT,
    "heroImage" TEXT,
    "heroImageUrl" TEXT,
    "ctaLabel" TEXT,
    "targetUrl" TEXT NOT NULL,
    "code" TEXT,
    "startsAt" DATETIME,
    "endsAt" DATETIME,
    "slug" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "scanCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "StorePromo_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Business" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "StorePromo_slug_key" ON "StorePromo"("slug");

-- CreateIndex
CREATE INDEX "StorePromo_storeId_idx" ON "StorePromo"("storeId");

-- CreateIndex
CREATE INDEX "StorePromo_slug_idx" ON "StorePromo"("slug");

-- CreateIndex
CREATE INDEX "StorePromo_isActive_idx" ON "StorePromo"("isActive");
