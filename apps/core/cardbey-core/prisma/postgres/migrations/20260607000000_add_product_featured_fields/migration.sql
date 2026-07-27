-- DANH: schema-gap-product-featured — required for catalog publish (createMany) and homepage feature skill
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "isFeatured" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "featuredAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "Product_businessId_isFeatured_idx" ON "Product"("businessId", "isFeatured");
