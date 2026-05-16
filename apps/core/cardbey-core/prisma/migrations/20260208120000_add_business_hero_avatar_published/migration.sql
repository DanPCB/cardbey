-- AlterTable: add first-class hero/avatar/publishedAt to Business for published store feed and preview
-- SQLite does not support adding multiple columns in one statement in older versions; use separate ALTERs.
ALTER TABLE "Business" ADD COLUMN "heroImageUrl" TEXT;
ALTER TABLE "Business" ADD COLUMN "avatarImageUrl" TEXT;
ALTER TABLE "Business" ADD COLUMN "publishedAt" DATETIME;
