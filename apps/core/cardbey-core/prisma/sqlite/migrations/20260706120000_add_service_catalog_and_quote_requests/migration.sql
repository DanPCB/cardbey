-- Service catalog metadata on Product + QuoteRequest model
ALTER TABLE "Product" ADD COLUMN "serviceCatalog" TEXT;

CREATE TABLE "QuoteRequest" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "storeId" TEXT NOT NULL,
  "serviceId" TEXT,
  "customerId" TEXT,
  "customerName" TEXT NOT NULL,
  "customerEmail" TEXT NOT NULL,
  "customerPhone" TEXT,
  "description" TEXT NOT NULL,
  "address" TEXT,
  "preferredDate" TEXT,
  "uploadedFiles" TEXT,
  "approximateSize" TEXT,
  "budget" REAL,
  "quoteAmount" REAL,
  "quoteMessage" TEXT,
  "status" TEXT NOT NULL DEFAULT 'new',
  "missionId" TEXT,
  "metadata" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "QuoteRequest_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "QuoteRequest_storeId_idx" ON "QuoteRequest"("storeId");
CREATE INDEX "QuoteRequest_storeId_status_idx" ON "QuoteRequest"("storeId", "status");
CREATE INDEX "QuoteRequest_storeId_createdAt_idx" ON "QuoteRequest"("storeId", "createdAt");
