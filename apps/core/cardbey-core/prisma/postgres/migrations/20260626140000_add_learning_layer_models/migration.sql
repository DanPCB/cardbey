-- Phase D — Learning Layer (Reasoning-Native Architecture)

CREATE TABLE IF NOT EXISTS "learning_user_profiles" (
    "user_id" TEXT NOT NULL,
    "preferred_workflows" JSONB NOT NULL DEFAULT '[]',
    "skipped_steps" JSONB NOT NULL DEFAULT '[]',
    "frequently_used_tools" JSONB NOT NULL DEFAULT '[]',
    "default_action" TEXT,
    "confidence_calibration" JSONB,
    "learning_enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "learning_user_profiles_pkey" PRIMARY KEY ("user_id")
);

CREATE TABLE IF NOT EXISTS "learning_user_feedback" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "target_type" TEXT NOT NULL,
    "target_id" TEXT NOT NULL,
    "value" INTEGER,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "learning_user_feedback_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "learning_user_feedback_user_id_session_id_idx"
    ON "learning_user_feedback"("user_id", "session_id");
CREATE INDEX IF NOT EXISTS "learning_user_feedback_user_id_type_idx"
    ON "learning_user_feedback"("user_id", "type");
CREATE INDEX IF NOT EXISTS "learning_user_feedback_target_type_target_id_idx"
    ON "learning_user_feedback"("target_type", "target_id");

CREATE TABLE IF NOT EXISTS "learning_behavior_patterns" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "pattern" TEXT NOT NULL,
    "frequency" INTEGER NOT NULL DEFAULT 1,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.3,
    "last_observed" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "learning_behavior_patterns_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "learning_behavior_patterns_user_id_pattern_key"
    ON "learning_behavior_patterns"("user_id", "pattern");
CREATE INDEX IF NOT EXISTS "learning_behavior_patterns_user_id_idx"
    ON "learning_behavior_patterns"("user_id");
