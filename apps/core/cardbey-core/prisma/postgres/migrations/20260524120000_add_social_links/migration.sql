-- Add socialLinks JSON to User and Business for profile/store social network URLs
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "socialLinks" JSONB;
ALTER TABLE "Business" ADD COLUMN IF NOT EXISTS "socialLinks" JSONB;
