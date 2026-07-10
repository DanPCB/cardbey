-- Payment + Stripe journey columns (commerce platform migration was SQLite-only until now)
CREATE TABLE IF NOT EXISTS "Payment" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "posOrderId" TEXT,
    "customerId" TEXT,
    "journeyId" TEXT,
    "linkedEntityType" TEXT,
    "linkedEntityId" TEXT,
    "stripePaymentIntentId" TEXT,
    "stripeCheckoutSessionId" TEXT,
    "method" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'AUD',
    "purpose" TEXT,
    "externalRef" TEXT,
    "runtimeExecutionId" TEXT,
    "missionId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- Backfill columns on older Payment tables (e.g. db-push dev DBs)
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "customerId" TEXT;
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "journeyId" TEXT;
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "linkedEntityType" TEXT;
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "linkedEntityId" TEXT;
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "stripePaymentIntentId" TEXT;
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "stripeCheckoutSessionId" TEXT;
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "purpose" TEXT;

CREATE INDEX IF NOT EXISTS "Payment_storeId_createdAt_idx" ON "Payment"("storeId", "createdAt");
CREATE INDEX IF NOT EXISTS "Payment_posOrderId_idx" ON "Payment"("posOrderId");
CREATE INDEX IF NOT EXISTS "Payment_stripePaymentIntentId_idx" ON "Payment"("stripePaymentIntentId");
CREATE INDEX IF NOT EXISTS "Payment_linkedEntityType_linkedEntityId_idx" ON "Payment"("linkedEntityType", "linkedEntityId");

DO $$ BEGIN
  ALTER TABLE "Payment" ADD CONSTRAINT "Payment_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "Payment" ADD CONSTRAINT "Payment_posOrderId_fkey" FOREIGN KEY ("posOrderId") REFERENCES "PosOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
  WHEN undefined_table THEN null;
END $$;
