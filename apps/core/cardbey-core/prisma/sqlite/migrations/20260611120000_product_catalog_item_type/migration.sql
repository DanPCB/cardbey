-- Catalog item commerce classification (service/booking vs product/order)
ALTER TABLE "Product" ADD COLUMN "itemType" TEXT;
ALTER TABLE "Product" ADD COLUMN "bookingEnabled" BOOLEAN;
ALTER TABLE "Product" ADD COLUMN "purchaseEnabled" BOOLEAN;
ALTER TABLE "Product" ADD COLUMN "primaryAction" TEXT;
