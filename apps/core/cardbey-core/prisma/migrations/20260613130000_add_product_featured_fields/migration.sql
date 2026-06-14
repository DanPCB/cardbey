-- DANH: schema-gap-product-featured
ALTER TABLE "Product" ADD COLUMN "isFeatured" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Product" ADD COLUMN "featuredAt" DATETIME;

CREATE INDEX IF NOT EXISTS "Product_businessId_isFeatured_idx" ON "Product"("businessId", "isFeatured");
