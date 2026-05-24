-- Add socialLinks JSON to User and Business for profile/store social network URLs
ALTER TABLE "User" ADD COLUMN "socialLinks" JSONB;
ALTER TABLE "Business" ADD COLUMN "socialLinks" JSONB;
