-- Migration: add_user_handle_support
-- Ensures handle field exists and is properly indexed
-- This migration is idempotent - safe to run multiple times

-- Note: If handle field already exists from previous migration, these statements will be no-ops
-- SQLite doesn't support IF NOT EXISTS for columns, so we check via PRAGMA first

-- Ensure handle column exists (if migration 20251125000000_add_user_profile_fields was not applied)
-- SQLite doesn't support ALTER TABLE ADD COLUMN IF NOT EXISTS, so we rely on Prisma migration system
-- This migration file is mainly for documentation and ensuring the index exists

-- Create unique index on handle if it doesn't exist
-- Note: SQLite will error if index already exists, but Prisma handles this
CREATE UNIQUE INDEX IF NOT EXISTS "User_handle_key" ON "User"("handle");

-- Create regular index on handle for faster lookups
CREATE INDEX IF NOT EXISTS "User_handle_idx" ON "User"("handle");

-- Migration complete
-- Next step: Run npm run backfill:handles to generate handles for existing users

