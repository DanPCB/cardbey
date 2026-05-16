-- Add kind and scopeKey to ConversationThread for resolve-scope find-or-create (store_default, user_default, mission_bound)
ALTER TABLE "ConversationThread" ADD COLUMN "kind" TEXT;
ALTER TABLE "ConversationThread" ADD COLUMN "scopeKey" TEXT;
CREATE INDEX "ConversationThread_kind_scopeKey_idx" ON "ConversationThread"("kind", "scopeKey");
