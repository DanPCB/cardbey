-- Preserve StoreLeadActivity metadata while aligning active Json? Prisma usage.
-- Invalid non-empty historical JSON aborts this migration instead of losing data.

ALTER TABLE "StoreLeadActivity"
ALTER COLUMN "metadata" TYPE JSONB
USING CASE
  WHEN "metadata" IS NULL OR btrim("metadata") = '' THEN NULL
  ELSE "metadata"::jsonb
END;