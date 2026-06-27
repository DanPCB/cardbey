-- Phase D — Learning Layer (Reasoning-Native Architecture)

CREATE TABLE IF NOT EXISTS "learning_user_profiles" (
    "user_id" TEXT NOT NULL PRIMARY KEY,
    "preferred_workflows" TEXT NOT NULL DEFAULT '[]',
    "skipped_steps" TEXT NOT NULL DEFAULT '[]',
    "frequently_used_tools" TEXT NOT NULL DEFAULT '[]',
    "default_action" TEXT,
    "confidence_calibration" TEXT,
    "learning_enabled" INTEGER NOT NULL DEFAULT 1,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

CREATE TABLE IF NOT EXISTS "learning_user_feedback" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "target_type" TEXT NOT NULL,
    "target_id" TEXT NOT NULL,
    "value" INTEGER,
    "metadata" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "learning_user_feedback_user_id_session_id_idx"
    ON "learning_user_feedback"("user_id", "session_id");
CREATE INDEX IF NOT EXISTS "learning_user_feedback_user_id_type_idx"
    ON "learning_user_feedback"("user_id", "type");
CREATE INDEX IF NOT EXISTS "learning_user_feedback_target_type_target_id_idx"
    ON "learning_user_feedback"("target_type", "target_id");

CREATE TABLE IF NOT EXISTS "learning_behavior_patterns" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "pattern" TEXT NOT NULL,
    "frequency" INTEGER NOT NULL DEFAULT 1,
    "confidence" REAL NOT NULL DEFAULT 0.3,
    "last_observed" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "learning_behavior_patterns_user_id_pattern_key"
    ON "learning_behavior_patterns"("user_id", "pattern");
CREATE INDEX IF NOT EXISTS "learning_behavior_patterns_user_id_idx"
    ON "learning_behavior_patterns"("user_id");
