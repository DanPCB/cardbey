-- Minimal DDL for OAuthConnection only. Safe to review/apply against production SQLite
-- (e.g. Render file:/data/cardbey-prod.db) when the table does not exist yet.
-- Apply: npx prisma db execute --file prisma/sql/add_oauth_connection_only.sql
-- (run from apps/core/cardbey-core with DATABASE_URL pointing at the target DB)
--
-- History: drifted migration 20260407024803 was removed from the repo; canonical
-- migration is 20260407140000_add_oauth_connection_clean (OAuthConnection only).

CREATE TABLE IF NOT EXISTS "OAuthConnection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT,
    "expiresAt" DATETIME,
    "pageId" TEXT,
    "pageName" TEXT,
    "scopes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE INDEX IF NOT EXISTS "OAuthConnection_userId_platform_idx" ON "OAuthConnection"("userId", "platform");

CREATE UNIQUE INDEX IF NOT EXISTS "OAuthConnection_userId_platform_pageId_key" ON "OAuthConnection"("userId", "platform", "pageId");
