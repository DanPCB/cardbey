-- Extend Payment for Stripe journey payments (SQLite)
ALTER TABLE "Payment" ADD COLUMN "customerId" TEXT;
ALTER TABLE "Payment" ADD COLUMN "journeyId" TEXT;
ALTER TABLE "Payment" ADD COLUMN "linkedEntityType" TEXT;
ALTER TABLE "Payment" ADD COLUMN "linkedEntityId" TEXT;
ALTER TABLE "Payment" ADD COLUMN "stripePaymentIntentId" TEXT;
ALTER TABLE "Payment" ADD COLUMN "stripeCheckoutSessionId" TEXT;
ALTER TABLE "Payment" ADD COLUMN "purpose" TEXT;

CREATE INDEX IF NOT EXISTS "Payment_stripePaymentIntentId_idx" ON "Payment"("stripePaymentIntentId");
CREATE INDEX IF NOT EXISTS "Payment_linkedEntityType_linkedEntityId_idx" ON "Payment"("linkedEntityType", "linkedEntityId");
