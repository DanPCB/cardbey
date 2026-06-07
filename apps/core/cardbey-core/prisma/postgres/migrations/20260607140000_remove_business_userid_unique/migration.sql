-- Enable multi-store: one user may own many Business rows (matches prisma/postgres/schema.prisma).
DROP INDEX IF EXISTS "Business_userId_key";

-- Non-unique lookup index for owner queries (safe if already present from a partial deploy).
CREATE INDEX IF NOT EXISTS "Business_userId_idx" ON "Business"("userId");
