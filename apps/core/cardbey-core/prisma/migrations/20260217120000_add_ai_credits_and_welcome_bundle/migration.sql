-- Add AI credits and welcome bundle columns to User (paid AI gating).
-- Safe to run on DBs that already have these columns via db push: use migrate resolve --applied if column exists.
-- SQLite: ADD COLUMN with NOT NULL requires DEFAULT.
ALTER TABLE "User" ADD COLUMN "aiCreditsBalance" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "welcomeFullStoreRemaining" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "User" ADD COLUMN "aiCreditsUpdatedAt" DATETIME;
