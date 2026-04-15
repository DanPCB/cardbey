-- Add BLOCKED status to MiJobStatus enum
-- Note: SQLite doesn't support enums natively, so this is just a documentation comment
-- The BLOCKED value will be stored as TEXT in the status column
-- Enum values are now: QUEUED, RUNNING, COMPLETED, FAILED, CANCELLED, BLOCKED

-- No actual schema changes needed for SQLite (enums are stored as TEXT)
-- This migration documents the addition of BLOCKED status


















