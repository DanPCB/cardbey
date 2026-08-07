/**
 * URI Phase 3 workspace table (non-destructive).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prisma, ensurePrismaConnection } from '../src/lib/prisma.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, '../.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const statements = [
  `CREATE TABLE IF NOT EXISTS "ResourceWorkspace" (
    "id" TEXT PRIMARY KEY NOT NULL,
    "userId" TEXT,
    "searchSessionId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "intentJson" TEXT,
    "searchPlanJson" TEXT,
    "stateJson" TEXT NOT NULL,
    "evaluationJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS "ResourceWorkspace_userId_idx" ON "ResourceWorkspace"("userId")`,
  `CREATE INDEX IF NOT EXISTS "ResourceWorkspace_searchSessionId_idx" ON "ResourceWorkspace"("searchSessionId")`,
];

export async function ensureUriWorkspaceTables() {
  await ensurePrismaConnection();
  for (const sql of statements) {
    await prisma.$executeRawUnsafe(sql);
  }
  return { ok: true };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  await ensureUriWorkspaceTables();
  console.log('URI workspace tables ensured');
  await prisma.$disconnect();
}
