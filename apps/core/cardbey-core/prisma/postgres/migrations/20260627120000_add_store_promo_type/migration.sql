-- DANH: schema-gap-storepromo-type — loyalty / discount / event / campaign promos
ALTER TABLE "StorePromo" ADD COLUMN IF NOT EXISTS "promoType" TEXT DEFAULT 'general';
