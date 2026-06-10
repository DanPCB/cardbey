-- Ensure Business hero/avatar/published columns for storefront feed + publish sync.
ALTER TABLE "Business" ADD COLUMN IF NOT EXISTS "heroImageUrl" TEXT;
ALTER TABLE "Business" ADD COLUMN IF NOT EXISTS "avatarImageUrl" TEXT;
ALTER TABLE "Business" ADD COLUMN IF NOT EXISTS "publishedAt" TIMESTAMP(3);
