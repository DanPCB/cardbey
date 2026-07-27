-- Device display rotation (canonical degrees). Keep orientation for dual-wire.
ALTER TABLE "Device" ADD COLUMN IF NOT EXISTS "rotationDegrees" INTEGER NOT NULL DEFAULT 0;

-- Migrate existing devices: vertical → 90°, everything else → 0°
UPDATE "Device" SET "rotationDegrees" = 90 WHERE "orientation" = 'vertical';
UPDATE "Device" SET "rotationDegrees" = 0 WHERE "orientation" IS DISTINCT FROM 'vertical';
