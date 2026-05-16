-- Catalog & Starter Pack (NEW – do not modify existing Store/Product)
-- Backwards-compatible: adds new tables only. No drops.

-- CreateTable
CREATE TABLE "BusinessType" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "Region" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL
);

-- CreateTable (CatalogCategory before CatalogItem due to FK)
CREATE TABLE "CatalogCategory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "parentId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "CatalogCategory_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "CatalogCategory" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CatalogItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "canonicalName" TEXT NOT NULL,
    "shortDescription" TEXT NOT NULL,
    "longDescription" TEXT,
    "tags" TEXT NOT NULL,
    "defaultCategoryKey" TEXT,
    "defaultCategoryId" TEXT,
    "suggestedPriceMin" REAL,
    "suggestedPriceMax" REAL,
    "currencyCode" TEXT,
    "imagePrompt" TEXT,
    "imageKeywords" TEXT,
    "modifiersJson" TEXT,
    "businessTypeHints" TEXT NOT NULL,
    "localeHints" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CatalogItem_defaultCategoryId_fkey" FOREIGN KEY ("defaultCategoryId") REFERENCES "CatalogCategory" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "StarterPack" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessTypeId" TEXT,
    "regionId" TEXT,
    "version" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "defaultCurrencyCode" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "StarterPack_businessTypeId_fkey" FOREIGN KEY ("businessTypeId") REFERENCES "BusinessType" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "StarterPack_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "Region" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "StarterPackItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "starterPackId" TEXT NOT NULL,
    "catalogItemId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "featured" INTEGER NOT NULL DEFAULT 0,
    "overridesJson" TEXT,
    CONSTRAINT "StarterPackItem_starterPackId_fkey" FOREIGN KEY ("starterPackId") REFERENCES "StarterPack" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "StarterPackItem_catalogItemId_fkey" FOREIGN KEY ("catalogItemId") REFERENCES "CatalogItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "StarterPackCategory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "starterPackId" TEXT NOT NULL,
    "catalogCategoryId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "StarterPackCategory_starterPackId_fkey" FOREIGN KEY ("starterPackId") REFERENCES "StarterPack" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "StarterPackCategory_catalogCategoryId_fkey" FOREIGN KEY ("catalogCategoryId") REFERENCES "CatalogCategory" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ValidatorRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "appliesToType" TEXT NOT NULL,
    "configJson" TEXT NOT NULL,
    "isEnabled" INTEGER NOT NULL DEFAULT 1,
    "severity" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "BusinessType_key_key" ON "BusinessType"("key");

-- CreateIndex
CREATE UNIQUE INDEX "Region_code_key" ON "Region"("code");

-- CreateIndex
CREATE INDEX "CatalogCategory_parentId_idx" ON "CatalogCategory"("parentId");

-- CreateIndex
CREATE INDEX "CatalogCategory_key_idx" ON "CatalogCategory"("key");

-- CreateIndex
CREATE INDEX "CatalogItem_type_idx" ON "CatalogItem"("type");

-- CreateIndex
CREATE INDEX "CatalogItem_defaultCategoryId_idx" ON "CatalogItem"("defaultCategoryId");

-- CreateIndex
CREATE INDEX "CatalogItem_defaultCategoryKey_idx" ON "CatalogItem"("defaultCategoryKey");

-- CreateIndex
CREATE INDEX "StarterPack_businessTypeId_idx" ON "StarterPack"("businessTypeId");

-- CreateIndex
CREATE INDEX "StarterPack_regionId_idx" ON "StarterPack"("regionId");

-- CreateIndex
CREATE INDEX "StarterPack_status_idx" ON "StarterPack"("status");

-- CreateIndex
CREATE INDEX "StarterPackItem_starterPackId_idx" ON "StarterPackItem"("starterPackId");

-- CreateIndex
CREATE INDEX "StarterPackItem_catalogItemId_idx" ON "StarterPackItem"("catalogItemId");

-- CreateIndex
CREATE UNIQUE INDEX "StarterPackItem_starterPackId_catalogItemId_key" ON "StarterPackItem"("starterPackId", "catalogItemId");

-- CreateIndex
CREATE INDEX "StarterPackCategory_starterPackId_idx" ON "StarterPackCategory"("starterPackId");

-- CreateIndex
CREATE INDEX "StarterPackCategory_catalogCategoryId_idx" ON "StarterPackCategory"("catalogCategoryId");

-- CreateIndex
CREATE UNIQUE INDEX "StarterPackCategory_starterPackId_catalogCategoryId_key" ON "StarterPackCategory"("starterPackId", "catalogCategoryId");

-- CreateIndex
CREATE INDEX "ValidatorRule_scope_idx" ON "ValidatorRule"("scope");

-- CreateIndex
CREATE INDEX "ValidatorRule_appliesToType_idx" ON "ValidatorRule"("appliesToType");

-- CreateIndex
CREATE INDEX "ValidatorRule_isEnabled_idx" ON "ValidatorRule"("isEnabled");
