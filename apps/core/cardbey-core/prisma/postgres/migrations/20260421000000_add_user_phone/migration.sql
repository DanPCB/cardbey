-- User columns present in prisma/postgres/schema.prisma but missing from earlier Postgres migrations.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "phone" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "addressLine1" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "addressLine2" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "city" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "country" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "postcode" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "verificationTokenRaw" TEXT;
