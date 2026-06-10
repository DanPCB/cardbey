-- Ensure Business hero/avatar/published columns for storefront feed + publish sync.
ALTER TABLE "Business" ADD COLUMN "heroImageUrl" TEXT;
ALTER TABLE "Business" ADD COLUMN "avatarImageUrl" TEXT;
ALTER TABLE "Business" ADD COLUMN "publishedAt" DATETIME;
