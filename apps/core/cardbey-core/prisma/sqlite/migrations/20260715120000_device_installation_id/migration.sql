-- Device V2 Phase 1: nullable installationId + non-unique index only.
-- Do not add a UNIQUE constraint in this phase.
-- This migration must alter Device only.

ALTER TABLE "Device" ADD COLUMN "installationId" TEXT;

CREATE INDEX IF NOT EXISTS "Device_installationId_idx" ON "Device"("installationId");
