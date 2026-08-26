-- User↔user connection graph (Phase B). Separate from StoreFollow / contact-sync.
-- Idempotent: safe on partial deploys.

CREATE TABLE IF NOT EXISTS "UserConnection" (
    "id" TEXT NOT NULL,
    "fromUserId" TEXT NOT NULL,
    "toUserId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "source" TEXT NOT NULL DEFAULT 'direct',
    "suggestionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "respondedAt" TIMESTAMP(3),
    CONSTRAINT "UserConnection_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "UserConnection_fromUserId_toUserId_key"
  ON "UserConnection"("fromUserId", "toUserId");

CREATE INDEX IF NOT EXISTS "UserConnection_toUserId_status_idx"
  ON "UserConnection"("toUserId", "status");

CREATE INDEX IF NOT EXISTS "UserConnection_fromUserId_status_idx"
  ON "UserConnection"("fromUserId", "status");

CREATE INDEX IF NOT EXISTS "UserConnection_status_updatedAt_idx"
  ON "UserConnection"("status", "updatedAt");

DO $$ BEGIN
  ALTER TABLE "UserConnection" ADD CONSTRAINT "UserConnection_fromUserId_fkey"
    FOREIGN KEY ("fromUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "UserConnection" ADD CONSTRAINT "UserConnection_toUserId_fkey"
    FOREIGN KEY ("toUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
