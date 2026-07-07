-- Service catalog metadata on Product + QuoteRequest model
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "serviceCatalog" JSONB;

CREATE TABLE IF NOT EXISTS "QuoteRequest" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "serviceId" TEXT,
  "customerId" TEXT,
  "customerName" TEXT NOT NULL,
  "customerEmail" TEXT NOT NULL,
  "customerPhone" TEXT,
  "description" TEXT NOT NULL,
  "address" TEXT,
  "preferredDate" TEXT,
  "uploadedFiles" JSONB,
  "approximateSize" TEXT,
  "budget" DOUBLE PRECISION,
  "quoteAmount" DOUBLE PRECISION,
  "quoteMessage" TEXT,
  "status" TEXT NOT NULL DEFAULT 'new',
  "missionId" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "QuoteRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "QuoteRequest_storeId_idx" ON "QuoteRequest"("storeId");
CREATE INDEX IF NOT EXISTS "QuoteRequest_storeId_status_idx" ON "QuoteRequest"("storeId", "status");
CREATE INDEX IF NOT EXISTS "QuoteRequest_storeId_createdAt_idx" ON "QuoteRequest"("storeId", "createdAt");

DO $$ BEGIN
  ALTER TABLE "QuoteRequest" ADD CONSTRAINT "QuoteRequest_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
