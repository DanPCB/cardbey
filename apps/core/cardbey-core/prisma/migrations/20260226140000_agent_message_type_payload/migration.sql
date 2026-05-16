-- Add messageType (default "text") and payload (nullable JSON) to AgentMessage for structured message types.
-- Backward-compatible: existing rows get messageType = "text", payload = NULL.

ALTER TABLE "AgentMessage" ADD COLUMN "messageType" TEXT NOT NULL DEFAULT 'text';
ALTER TABLE "AgentMessage" ADD COLUMN "payload" TEXT;
