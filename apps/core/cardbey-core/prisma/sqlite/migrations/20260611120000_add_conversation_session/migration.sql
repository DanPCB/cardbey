-- Phase 0 — Continuous conversation sessions (Performer console)
CREATE TABLE IF NOT EXISTS "conversation_sessions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "store_id" TEXT,
    "surface" TEXT NOT NULL DEFAULT 'performer_console',
    "status" TEXT NOT NULL DEFAULT 'active',
    "title" TEXT,
    "summary" TEXT,
    "message_count" INTEGER NOT NULL DEFAULT 0,
    "last_message_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "active_mission_id" TEXT,
    "metadata" TEXT NOT NULL DEFAULT '{}',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "conversation_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "conversation_sessions_user_id_status_last_message_at_idx" ON "conversation_sessions"("user_id", "status", "last_message_at");
CREATE INDEX IF NOT EXISTS "conversation_sessions_store_id_last_message_at_idx" ON "conversation_sessions"("store_id", "last_message_at");

CREATE TABLE IF NOT EXISTS "conversation_messages" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "session_id" TEXT NOT NULL,
    "mission_id" TEXT,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "content_json" TEXT,
    "tool_calls" TEXT,
    "artifacts" TEXT,
    "token_count" INTEGER,
    "sequence" INTEGER NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "conversation_messages_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "conversation_sessions" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "conversation_messages_mission_id_fkey" FOREIGN KEY ("mission_id") REFERENCES "MissionPipeline" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "conversation_messages_session_id_sequence_key" ON "conversation_messages"("session_id", "sequence");
CREATE INDEX IF NOT EXISTS "conversation_messages_session_id_created_at_idx" ON "conversation_messages"("session_id", "created_at");
CREATE INDEX IF NOT EXISTS "conversation_messages_mission_id_idx" ON "conversation_messages"("mission_id");

CREATE TABLE IF NOT EXISTS "conversation_pending_actions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "session_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "proposed_action" TEXT,
    "mission_id" TEXT,
    "step_id" TEXT,
    "payload_json" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" DATETIME,
    CONSTRAINT "conversation_pending_actions_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "conversation_sessions" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "conversation_pending_actions_session_id_status_idx" ON "conversation_pending_actions"("session_id", "status");
