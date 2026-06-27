-- Phase A — Performer Context Engine session persistence
CREATE TABLE IF NOT EXISTS "performer_session_contexts" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "context_json" TEXT NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "ended_at" TIMESTAMP(3),

    CONSTRAINT "performer_session_contexts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "performer_session_contexts_user_id_session_id_key"
    ON "performer_session_contexts"("user_id", "session_id");
CREATE INDEX IF NOT EXISTS "performer_session_contexts_user_id_session_id_active_idx"
    ON "performer_session_contexts"("user_id", "session_id", "active");
