-- DANH: schema-gap-storepromo-type — loyalty / discount / event / campaign promos
ALTER TABLE "StorePromo" ADD COLUMN "promoType" TEXT DEFAULT 'general';
