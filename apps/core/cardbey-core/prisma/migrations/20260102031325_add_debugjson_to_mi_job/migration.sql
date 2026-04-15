/*
  Safe Migration: Add debugJson to MiGenerationJob
  
  This migration:
  1. Adds debugJson column (TEXT, nullable) to MiGenerationJob
  2. Preserves existing errorJson and resultJson values (already TEXT in SQLite)
  3. Does NOT recreate tables - purely additive
  
  Note: SQLite stores JSON as TEXT, so we use TEXT type.
  Prisma's Json type maps to TEXT in SQLite.
*/

-- Add debugJson column to MiGenerationJob (TEXT for SQLite, nullable)
ALTER TABLE "MiGenerationJob" ADD COLUMN "debugJson" TEXT;

-- Note: errorJson and resultJson are already TEXT in SQLite
-- No conversion needed - Prisma will parse them as JSON at runtime
-- Existing data is preserved as-is
