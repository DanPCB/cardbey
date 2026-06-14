#!/usr/bin/env node
/**
 * Idempotent: ensure SkillDispatchLog.query exists (legacy SQLite drift).
 */
import '../src/env/ensureDatabaseUrl.js';
import { createRequire } from 'node:module';
import { resolveSqliteDatabasePath } from '../src/lib/sqliteDbPath.js';

const require = createRequire(import.meta.url);
const { DatabaseSync } = require('node:sqlite');

const COLUMNS = [
  { name: 'query', ddl: 'ALTER TABLE "SkillDispatchLog" ADD COLUMN "query" TEXT NOT NULL DEFAULT \'\'' },
];

function tableColumns(db, table) {
  return new Set(db.prepare(`PRAGMA table_info("${table}")`).all().map((row) => row.name));
}

function main() {
  const dbPath = resolveSqliteDatabasePath();
  if (!dbPath) {
    console.error('[ensure-skill-dispatch-log-columns] DATABASE_URL must be a SQLite file: URL');
    process.exit(1);
  }

  const db = new DatabaseSync(dbPath);
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='SkillDispatchLog'").all();
  if (!tables.length) {
    console.log('[ensure-skill-dispatch-log-columns] SkillDispatchLog table missing — run prisma migrate deploy');
    db.close();
    return;
  }

  const existing = tableColumns(db, 'SkillDispatchLog');
  const added = [];
  for (const col of COLUMNS) {
    if (existing.has(col.name)) continue;
    db.exec(col.ddl);
    added.push(col.name);
  }
  db.close();
  console.log('[ensure-skill-dispatch-log-columns] ok', { dbPath, added });
}

main();
