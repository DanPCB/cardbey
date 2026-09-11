import { PrismaClient } from '@prisma/client';

const p = new PrismaClient();

async function main() {
  await p.$executeRawUnsafe(`
CREATE TABLE IF NOT EXISTS "Comment" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "contentType" TEXT NOT NULL,
  "contentId" TEXT NOT NULL,
  "activityId" TEXT,
  "storeId" TEXT,
  "actorUserId" TEXT NOT NULL,
  "actorType" TEXT NOT NULL DEFAULT 'user',
  "text" TEXT NOT NULL,
  "parentCommentId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
)`);
  const indexes = [
    'CREATE INDEX IF NOT EXISTS "Comment_contentType_contentId_createdAt_idx" ON "Comment"("contentType", "contentId", "createdAt")',
    'CREATE INDEX IF NOT EXISTS "Comment_contentId_createdAt_idx" ON "Comment"("contentId", "createdAt")',
    'CREATE INDEX IF NOT EXISTS "Comment_actorUserId_idx" ON "Comment"("actorUserId")',
    'CREATE INDEX IF NOT EXISTS "Comment_activityId_idx" ON "Comment"("activityId")',
    'CREATE INDEX IF NOT EXISTS "Comment_storeId_idx" ON "Comment"("storeId")',
    'CREATE INDEX IF NOT EXISTS "Comment_status_idx" ON "Comment"("status")',
  ];
  for (const sql of indexes) {
    await p.$executeRawUnsafe(sql);
  }
  const n = await p.comment.count();
  console.log('Comment table ready, count=', n);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => p.$disconnect());
