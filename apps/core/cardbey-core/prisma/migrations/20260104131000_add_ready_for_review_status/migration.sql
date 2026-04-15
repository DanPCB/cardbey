-- Add READY_FOR_REVIEW status to MiJobStatus enum
-- Note: SQLite doesn't support enums natively, so this is just a documentation comment
-- The READY_FOR_REVIEW value will be stored as TEXT in the status column
-- Enum values are now: QUEUED, RUNNING, COMPLETED, FAILED, CANCELLED, BLOCKED, READY_FOR_REVIEW

-- No actual schema changes needed for SQLite (enums are stored as TEXT)
-- This migration documents the addition of READY_FOR_REVIEW status


















