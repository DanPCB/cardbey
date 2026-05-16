-- Make progressPct non-nullable (set default 0 for existing rows)
-- SQLite doesn't support ALTER COLUMN, so we update existing rows
UPDATE "MiJob" SET "progressPct" = 0 WHERE "progressPct" IS NULL;
-- Note: Schema change is handled by Prisma, this migration just ensures data consistency

