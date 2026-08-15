-- Phase 6: Business.seedId uniqueness for concurrent claim hardening (SQLite)
-- SQLite UNIQUE allows multiple NULLs; non-null seedId values must be unique.
ALTER TABLE "Business" ADD COLUMN "seedId" TEXT;

CREATE INDEX IF NOT EXISTS "Business_seedId_idx" ON "Business"("seedId");

CREATE UNIQUE INDEX IF NOT EXISTS "Business_seedId_unique" ON "Business"("seedId");
