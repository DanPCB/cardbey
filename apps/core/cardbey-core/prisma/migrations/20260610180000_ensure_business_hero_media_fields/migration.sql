-- No-op: heroImageUrl, avatarImageUrl, publishedAt were added in 20260208120000_add_business_hero_avatar_published.
-- Idempotent repair for drifted local DBs: scripts/repair-sqlite-schema.mjs
SELECT 1;
