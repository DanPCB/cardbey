-- Catalog item commerce classification (service/booking vs product/order)
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "itemType" TEXT;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "bookingEnabled" BOOLEAN;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "purchaseEnabled" BOOLEAN;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "primaryAction" TEXT;
