/**
 * Additive ContentEditProposal table for SQLite DATABASE_URL.
 * Does NOT run prisma db push.
 *
 * Usage (from apps/core/cardbey-core):
 *   node scripts/apply-content-edit-proposal-sqlite.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function loadDatabaseUrl() {
  if (process.env.DATABASE_URL?.startsWith('file:')) return process.env.DATABASE_URL;
  const envPath = path.join(root, '.env');
  const text = fs.readFileSync(envPath, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^DATABASE_URL=(.*)$/);
    if (!m) continue;
    let v = m[1].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    return v;
  }
  throw new Error('DATABASE_URL not found');
}

function resolveSqlitePath(databaseUrl) {
  const raw = databaseUrl.replace(/^file:/, '').split('?')[0];
  if (path.isAbsolute(raw) || /^[A-Za-z]:[\\/]/.test(raw)) return path.normalize(raw);
  return path.resolve(root, raw);
}

const databaseUrl = loadDatabaseUrl();
const dbPath = resolveSqlitePath(databaseUrl);
if (!fs.existsSync(dbPath)) {
  throw new Error(`SQLite file not found: ${dbPath}`);
}

const db = new DatabaseSync(dbPath);
const tables = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='ContentEditProposal'`).all();
if (tables.length) {
  console.log('[content-edit-proposal] table already exists');
  db.close();
  process.exit(0);
}

db.exec(`
CREATE TABLE "ContentEditProposal" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "actorId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "draftId" TEXT,
  "revisionId" TEXT,
  "contentType" TEXT NOT NULL,
  "contentItemId" TEXT NOT NULL,
  "scopedFieldsJson" TEXT NOT NULL,
  "baseFingerprint" TEXT NOT NULL,
  "baseUpdatedAt" TEXT,
  "proposedPatchJson" TEXT NOT NULL,
  "beforeSnapshotJson" TEXT NOT NULL,
  "afterSnapshotJson" TEXT NOT NULL,
  "providerMethod" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "expiresAt" DATETIME NOT NULL,
  "acceptedAt" DATETIME,
  "discardedAt" DATETIME,
  "appliedRevisionId" TEXT,
  "adminReason" TEXT,
  "correlationId" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);
CREATE INDEX "ContentEditProposal_storeId_status_createdAt_idx" ON "ContentEditProposal"("storeId", "status", "createdAt");
CREATE INDEX "ContentEditProposal_actorId_createdAt_idx" ON "ContentEditProposal"("actorId", "createdAt");
CREATE INDEX "ContentEditProposal_contentType_contentItemId_status_idx" ON "ContentEditProposal"("contentType", "contentItemId", "status");
CREATE INDEX "ContentEditProposal_expiresAt_idx" ON "ContentEditProposal"("expiresAt");
CREATE INDEX "ContentEditProposal_correlationId_idx" ON "ContentEditProposal"("correlationId");
`);
console.log('[content-edit-proposal] created ContentEditProposal');
db.close();
