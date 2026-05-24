#!/usr/bin/env node
/**
 * Idempotent: create PublishedArtifactProjection on the Core dev SQLite file only.
 * Use when full `prisma db push` is blocked by unrelated schema drift.
 */
import '../src/env/ensureDatabaseUrl.js';
import { PrismaClient } from '../src/lib/prismaClient.js';

const DDL = `
CREATE TABLE IF NOT EXISTS "PublishedArtifactProjection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "artifactType" TEXT NOT NULL DEFAULT 'business',
    "businessId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "version" TEXT NOT NULL DEFAULT 'v1',
    "projectionJson" JSONB NOT NULL,
    "sourceDraftId" TEXT,
    "publishRunId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PublishedArtifactProjection_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "PublishedArtifactProjection_businessId_key" ON "PublishedArtifactProjection"("businessId");
CREATE INDEX IF NOT EXISTS "PublishedArtifactProjection_slug_idx" ON "PublishedArtifactProjection"("slug");
CREATE INDEX IF NOT EXISTS "PublishedArtifactProjection_tenantId_slug_idx" ON "PublishedArtifactProjection"("tenantId", "slug");
`;

const prisma = new PrismaClient();

async function main() {
  console.log('[ensure-projection-table] DATABASE_URL=', process.env.DATABASE_URL);
  const statements = DDL.split(';')
    .map((s) => s.trim())
    .filter(Boolean);
  for (const sql of statements) {
    await prisma.$executeRawUnsafe(sql);
  }
  const rows = await prisma.$queryRawUnsafe(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'PublishedArtifactProjection'`,
  );
  console.log('[ensure-projection-table] ok', { tablePresent: rows.length > 0 });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
