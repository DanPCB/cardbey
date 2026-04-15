-- Add publicId column to Product table (non-destructive)
-- This column is used for stable QR code URLs

-- Add publicId column (nullable, unique)
ALTER TABLE "Product" ADD COLUMN "publicId" TEXT;

-- Create unique index on publicId
CREATE UNIQUE INDEX "Product_publicId_key" ON "Product"("publicId");

-- Create index for lookups
CREATE INDEX "Product_publicId_idx" ON "Product"("publicId");



















