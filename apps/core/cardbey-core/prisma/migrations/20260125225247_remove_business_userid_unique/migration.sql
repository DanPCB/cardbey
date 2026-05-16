-- Remove unique constraint from Business.userId
-- This enables multi-store support (multiple stores per user)

-- SQLite does not support DROP CONSTRAINT directly
-- We need to recreate the table without the unique constraint

-- Step 1: Create new table without unique constraint
CREATE TABLE "Business_new" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "slug" TEXT NOT NULL UNIQUE,
  "description" TEXT,
  "translations" TEXT,
  "logo" TEXT,
  "region" TEXT,
  "isActive" INTEGER NOT NULL DEFAULT 1,
  "tradingHours" TEXT,
  "address" TEXT,
  "suburb" TEXT,
  "postcode" TEXT,
  "country" TEXT,
  "phone" TEXT,
  "lat" REAL,
  "lng" REAL,
  "primaryColor" TEXT,
  "secondaryColor" TEXT,
  "tagline" TEXT,
  "heroText" TEXT,
  "stylePreferences" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Step 2: Copy data from old table to new table
INSERT INTO "Business_new" SELECT * FROM "Business";

-- Step 3: Drop old table
DROP TABLE "Business";

-- Step 4: Rename new table to original name
ALTER TABLE "Business_new" RENAME TO "Business";

-- Step 5: Recreate indexes
CREATE INDEX "Business_userId_idx" ON "Business"("userId");
CREATE INDEX "Business_slug_idx" ON "Business"("slug");
