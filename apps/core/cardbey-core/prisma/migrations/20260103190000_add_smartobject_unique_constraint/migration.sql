-- Add unique constraint for idempotent SmartObject creation
-- Prevents duplicate SmartObjects for same storeId + productId + type combination

-- Create unique index (SQLite doesn't support named constraints, so we use a unique index)
CREATE UNIQUE INDEX IF NOT EXISTS "unique_store_product_type" ON "SmartObject"("storeId", "productId", "type");



















