-- Store loyalty stamps (renamed from legacy LoyaltyStamp in repair script when needed)
CREATE TABLE IF NOT EXISTS "LoyaltyProgramStamp" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "rewarded" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LoyaltyProgramStamp_programId_fkey" FOREIGN KEY ("programId") REFERENCES "LoyaltyProgram" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "LoyaltyProgramStamp_tenantId_idx" ON "LoyaltyProgramStamp"("tenantId");
CREATE INDEX IF NOT EXISTS "LoyaltyProgramStamp_storeId_idx" ON "LoyaltyProgramStamp"("storeId");
CREATE INDEX IF NOT EXISTS "LoyaltyProgramStamp_programId_idx" ON "LoyaltyProgramStamp"("programId");
CREATE INDEX IF NOT EXISTS "LoyaltyProgramStamp_customerId_idx" ON "LoyaltyProgramStamp"("customerId");
CREATE UNIQUE INDEX IF NOT EXISTS "LoyaltyProgramStamp_tenantId_storeId_programId_customerId_key" ON "LoyaltyProgramStamp"("tenantId", "storeId", "programId", "customerId");
