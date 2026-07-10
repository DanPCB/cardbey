-- Extend Payment for Stripe journey payments
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "customerId" TEXT;
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "journeyId" TEXT;
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "linkedEntityType" TEXT;
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "linkedEntityId" TEXT;
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "stripePaymentIntentId" TEXT;
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "stripeCheckoutSessionId" TEXT;
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "purpose" TEXT;

CREATE INDEX IF NOT EXISTS "Payment_stripePaymentIntentId_idx" ON "Payment"("stripePaymentIntentId");
CREATE INDEX IF NOT EXISTS "Payment_linkedEntityType_linkedEntityId_idx" ON "Payment"("linkedEntityType", "linkedEntityId");
