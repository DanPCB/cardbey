-- Persist commerce mode on published businesses (booking vs order).
ALTER TABLE "Business" ADD COLUMN IF NOT EXISTS "transactionMode" TEXT NOT NULL DEFAULT 'order';
ALTER TABLE "Business" ADD COLUMN IF NOT EXISTS "catalogLabel" TEXT NOT NULL DEFAULT 'Products';
ALTER TABLE "Business" ADD COLUMN IF NOT EXISTS "ctaLabel" TEXT NOT NULL DEFAULT 'Order now';
