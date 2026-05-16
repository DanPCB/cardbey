-- AlterTable
-- SQLite uses TEXT for JSON, not JSONB
ALTER TABLE "Product" ADD COLUMN "tags" TEXT;
