-- Replace composite index with @@index([kind]) and @@unique([scopeKey]) for resolve-scope lookups
DROP INDEX IF EXISTS "ConversationThread_kind_scopeKey_idx";
CREATE INDEX "ConversationThread_kind_idx" ON "ConversationThread"("kind");
CREATE UNIQUE INDEX "ConversationThread_scopeKey_key" ON "ConversationThread"("scopeKey");
