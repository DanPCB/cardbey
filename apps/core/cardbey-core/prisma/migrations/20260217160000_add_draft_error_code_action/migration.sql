-- Add structured draft failure fields for UI (errorCode + recommendedAction).
ALTER TABLE "DraftStore" ADD COLUMN "errorCode" TEXT;
ALTER TABLE "DraftStore" ADD COLUMN "recommendedAction" TEXT;
