/**
 * Detect legacy migrations whose SQL is already reflected in a SQLite DB (db-push baseline).
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { listMigrationFolderNames } from './schemaFingerprint.js';

const require = createRequire(import.meta.url);

function openSqlite(dbPath, readonly = false) {
  const { DatabaseSync } = require('node:sqlite');
  return readonly ? new DatabaseSync(dbPath, { readonly: true }) : new DatabaseSync(dbPath);
}

function tableExists(db, table) {
  return !!db
    .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?")
    .get(table);
}

function tableHasColumn(db, table, column) {
  if (!tableExists(db, table)) return false;
  const cols = db.prepare(`PRAGMA table_info("${table.replace(/"/g, '""')}")`).all();
  return cols.some((c) => c.name === column);
}

function parseTableRenames(sql) {
  return [...sql.matchAll(/ALTER TABLE\s+"?new_(\w+)"?\s+RENAME TO\s+"?(\w+)"?/gi)].map(
    (m) => ({ from: `new_${m[1]}`, to: m[2] }),
  );
}

function parseDroppedColumns(sql) {
  return [...sql.matchAll(/drop the column `(\w+)` on the `(\w+)` table/gi)].map((m) => ({
    table: m[2],
    column: m[1],
  }));
}

/**
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {string} sql
 */
export function migrationSqlReflectsSchema(db, sql) {
  const renames = parseTableRenames(sql);
  const renameFinalByStaging = new Map(renames.map((r) => [r.from, r.to]));
  const droppedColumns = parseDroppedColumns(sql);

  for (const { table, column } of droppedColumns) {
    if (tableHasColumn(db, table, column)) {
      return { safe: false, reason: `column ${table}.${column} should be dropped` };
    }
    if (!tableExists(db, table)) {
      return { safe: false, reason: `table ${table} missing` };
    }
  }

  const createTables = [...sql.matchAll(/CREATE TABLE\s+(?:IF NOT EXISTS\s+)?"?(\w+)"?/gi)];
  for (const [, table] of createTables) {
    if (table.startsWith('new_')) {
      const finalName = renameFinalByStaging.get(table) ?? table.slice(4);
      if (!tableExists(db, finalName)) {
        return { safe: false, reason: `redefined table ${finalName} missing` };
      }
      continue;
    }
    if (!tableExists(db, table)) {
      return { safe: false, reason: `table ${table} missing` };
    }
  }

  const alterTables = [...sql.matchAll(/ALTER TABLE\s+"?(\w+)"?\s+(?!RENAME)/gi)];
  const addCols = [...sql.matchAll(/ADD COLUMN\s+"?(\w+)"?/gi)];
  for (let i = 0; i < addCols.length; i++) {
    const col = addCols[i][1];
    const table = alterTables[i]?.[1] || alterTables[0]?.[1];
    if (table && !table.startsWith('new_') && !tableHasColumn(db, table, col)) {
      return { safe: false, reason: `column ${table}.${col} not in DB` };
    }
  }

  if (/CREATE INDEX/i.test(sql) && !createTables.length && !addCols.length && !renames.length) {
    return { safe: true, reason: 'indexes only' };
  }

  if (!createTables.length && !addCols.length && !renames.length && !droppedColumns.length && sql.trim()) {
    return { safe: true, reason: 'non-destructive or already-applied SQL' };
  }

  return { safe: true, reason: 'schema includes migration changes' };
}

function getMigrationRowsByName(dbPath) {
  const db = openSqlite(dbPath, true);
  try {
    const rows = db
      .prepare('SELECT migration_name, finished_at FROM _prisma_migrations')
      .all();
    return new Map(rows.map((r) => [r.migration_name, r]));
  } finally {
    db.close();
  }
}

/**
 * @param {string} dbPath
 * @param {string} migrationsDir
 * @returns {{ name: string, reason: string }[]}
 */
export function listBaselineRepairCandidates(dbPath, migrationsDir) {
  if (!dbPath || !fs.existsSync(dbPath)) return [];
  const folders = listMigrationFolderNames(migrationsDir);
  const rowsByName = getMigrationRowsByName(dbPath);
  const db = openSqlite(dbPath, true);
  const candidates = [];
  try {
    for (const name of folders) {
      const row = rowsByName.get(name);
      if (row?.finished_at != null) continue;
      const sqlPath = path.join(migrationsDir, name, 'migration.sql');
      if (!fs.existsSync(sqlPath)) continue;
      const sql = fs.readFileSync(sqlPath, 'utf8');
      const check = migrationSqlReflectsSchema(db, sql);
      if (check.safe) candidates.push({ name, reason: check.reason });
    }
  } finally {
    db.close();
  }
  return candidates;
}

/**
 * Mark migrations as applied in _prisma_migrations (handles failed rows).
 * @returns {number} count marked
 */
export function markMigrationsApplied(dbPath, migrationNames, migrationsDir) {
  if (!migrationNames.length) return 0;
  const db = openSqlite(dbPath);
  let marked = 0;
  try {
    for (const migrationName of migrationNames) {
      const existing = db
        .prepare(
          `SELECT finished_at, rolled_back_at FROM _prisma_migrations WHERE migration_name = ?`,
        )
        .get(migrationName);
      if (existing?.finished_at != null) continue;

      const now = Date.now();
      const checksum = checksumForMigration(migrationsDir, migrationName);

      if (existing && existing.finished_at == null) {
        db.prepare(
          `UPDATE _prisma_migrations
           SET finished_at = ?, rolled_back_at = NULL, logs = NULL, checksum = ?, applied_steps_count = 1
           WHERE migration_name = ? AND finished_at IS NULL`,
        ).run(now, checksum, migrationName);
        marked++;
        continue;
      }

      const id = crypto.randomUUID();
      db.prepare(
        `INSERT INTO _prisma_migrations
         (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
         VALUES (?, ?, ?, ?, NULL, NULL, ?, 1)`,
      ).run(id, checksum, now, migrationName, now);
      marked++;
    }
  } finally {
    db.close();
  }
  return marked;
}

function checksumForMigration(migrationsDir, migrationName) {
  const sqlPath = path.join(migrationsDir, migrationName, 'migration.sql');
  return crypto.createHash('sha256').update(fs.readFileSync(sqlPath)).digest('hex');
}

/** @returns {string[]} */
export function listFailedMigrationNames(dbPath) {
  if (!dbPath || !fs.existsSync(dbPath)) return [];
  const db = openSqlite(dbPath, true);
  try {
    return db
      .prepare(
        `SELECT migration_name FROM _prisma_migrations
         WHERE finished_at IS NULL AND rolled_back_at IS NULL
         ORDER BY started_at`,
      )
      .all()
      .map((r) => r.migration_name);
  } finally {
    db.close();
  }
}

/** Clear failed rows so migrate deploy can retry the SQL. @returns {number} */
export function clearFailedMigrationRows(dbPath, migrationNames) {
  if (!migrationNames.length) return 0;
  const db = openSqlite(dbPath);
  let cleared = 0;
  try {
    const now = Date.now();
    for (const name of migrationNames) {
      const r = db
        .prepare(
          `UPDATE _prisma_migrations
           SET rolled_back_at = ?, logs = NULL
           WHERE migration_name = ? AND finished_at IS NULL AND rolled_back_at IS NULL`,
        )
        .run(now, name);
      cleared += r.changes ?? 0;
    }
  } finally {
    db.close();
  }
  return cleared;
}

/**
 * Apply all baseline-safe migrations in passes until none remain.
 * @returns {number}
 */
export function applyBaselineRepairPasses(dbPath, migrationsDir, maxPasses = 20) {
  let total = 0;
  for (let pass = 0; pass < maxPasses; pass++) {
    const candidates = listBaselineRepairCandidates(dbPath, migrationsDir);
    if (!candidates.length) break;
    const marked = markMigrationsApplied(
      dbPath,
      candidates.map((c) => c.name),
      migrationsDir,
    );
    total += marked;
    if (marked === 0) break;
  }
  return total;
}

function splitSqlStatements(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !/^--/.test(s));
}

function isBenignSqliteError(message) {
  const msg = String(message || '').toLowerCase();
  return (
    msg.includes('already exists') ||
    msg.includes('duplicate column') ||
    msg.includes('duplicate column name')
  );
}

/**
 * Apply migration SQL, skipping parts already present (db-push drift).
 * @returns {{ applied: number, skipped: number }}
 */
export function applyMigrationSqlBestEffort(dbPath, migrationsDir, migrationName) {
  const sqlPath = path.join(migrationsDir, migrationName, 'migration.sql');
  if (!fs.existsSync(sqlPath)) {
    throw new Error(`migration.sql not found: ${migrationName}`);
  }
  const sql = fs.readFileSync(sqlPath, 'utf8');
  const db = openSqlite(dbPath);
  let applied = 0;
  let skipped = 0;
  try {
    for (const stmt of splitSqlStatements(sql)) {
      if (/^PRAGMA/i.test(stmt)) {
        try {
          db.exec(`${stmt};`);
          applied++;
        } catch {
          skipped++;
        }
        continue;
      }

      const addCol = stmt.match(/ALTER TABLE\s+"?(\w+)"?\s+ADD COLUMN\s+"?(\w+)"?/i);
      if (addCol && tableHasColumn(db, addCol[1], addCol[2])) {
        skipped++;
        continue;
      }

      const createTable = stmt.match(/CREATE TABLE\s+"?(\w+)"?/i);
      if (createTable && tableExists(db, createTable[1])) {
        skipped++;
        continue;
      }

      try {
        db.exec(`${stmt};`);
        applied++;
      } catch (error) {
        if (isBenignSqliteError(error?.message || error)) {
          skipped++;
          continue;
        }
        throw error;
      }
    }
  } finally {
    db.close();
  }
  return { applied, skipped };
}

/** @returns {string | null} */
export function parseMigrationNameFromPrismaError(text) {
  const blob = String(text || '');
  const backtick = blob.match(/`(\d{14}_[\w]+)`/);
  if (backtick) return backtick[1];
  const applying = blob.match(/Applying migration `([^`]+)`/);
  return applying?.[1] ?? null;
}

export function repairAndMarkMigration(dbPath, migrationsDir, migrationName) {
  const result = applyMigrationSqlBestEffort(dbPath, migrationsDir, migrationName);
  const marked = markMigrationsApplied(dbPath, [migrationName], migrationsDir);
  return { ...result, marked };
}
