-- Skill Runtime Phase 1 — checkpoint storage.
--
-- Standalone, additive migration. It is kept out of the Prisma-managed
-- migration folders on purpose: there is no Prisma model for this table yet,
-- and adding raw SQL to prisma/postgres/migrations would cause migrate-deploy
-- drift errors. Apply it directly (psql / a release task):
--
--   psql "$DATABASE_URL" -f src/lib/skill_runtime/migrations/0001_create_skill_checkpoints.sql
--
-- Postgres 13+ (uses gen_random_uuid from the built-in pgcrypto/uuid support).

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS skill_checkpoints (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  skill_id    TEXT NOT NULL,
  checkpoint  JSONB NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One current checkpoint per skill, enabling the upsert in
-- PostgresCheckpointStore.save (ON CONFLICT (skill_id)).
CREATE UNIQUE INDEX IF NOT EXISTS skill_checkpoints_skill_id_key
  ON skill_checkpoints (skill_id);

CREATE INDEX IF NOT EXISTS skill_checkpoints_created_at_idx
  ON skill_checkpoints (created_at);
