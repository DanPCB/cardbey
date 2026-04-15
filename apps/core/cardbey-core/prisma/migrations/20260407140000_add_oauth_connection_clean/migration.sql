-- OAuthConnection only (replaces drifted 20260407024803_add_oauth_connection).
-- IF NOT EXISTS: safe if table already exists (e.g. prod pre-created via prisma/sql/add_oauth_connection_only.sql).

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
