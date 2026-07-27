#!/usr/bin/env node
/**
 * Generate docs/db/schema-fingerprint.json and schema snapshots.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import {
  buildSchemaFingerprint,
  FINGERPRINT_JSON_PATH,
  REQUIRED_COLUMNS,
  SCHEMA_SQLITE_PATH,
  readSchemaPrismaHash,
  hashMigrationFolders,
} from '../src/lib/schemaFingerprint.js';
import { PACKAGE_ROOT } from '../src/lib/sqliteDbPath.js';

const docsDb = path.join(PACKAGE_ROOT, 'docs', 'db');
fs.mkdirSync(docsDb, { recursive: true });

dotenv.config({ path: path.join(PACKAGE_ROOT, '.env'), override: true });
if (!process.env.DATABASE_URL?.startsWith('file:')) {
  process.env.DATABASE_URL = 'file:../dev.db';
}

const fp = buildSchemaFingerprint();
const payload = {
  provider: fp.provider,
  schemaPrismaHash: fp.schemaPrismaHash,
  migrationFoldersHash: fp.migrationFoldersHash,
  tableColumnHash: fp.tableColumnHash,
  generatedAt: fp.generatedAt,
  prismaVersion: fp.prismaVersion,
  prismaClientVersion: fp.prismaClientVersion,
  requiredColumns: REQUIRED_COLUMNS,
  canonicalDatabaseUrl: 'file:../dev.db',
  schemaPath: 'prisma/sqlite/schema.prisma',
};

fs.writeFileSync(FINGERPRINT_JSON_PATH, JSON.stringify(payload, null, 2) + '\n');
fs.copyFileSync(SCHEMA_SQLITE_PATH, path.join(docsDb, 'schema-current.prisma.snapshot'));

// SQL snapshot via sqlite .schema
const resolved = fp.resolvedDbPath;
if (resolved && fs.existsSync(resolved)) {
  const { execSync } = await import('node:child_process');
  try {
    const sql = execSync(`sqlite3 "${resolved.replace(/"/g, '""')}" ".schema"`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    fs.writeFileSync(path.join(docsDb, 'schema-current.sql.snapshot'), sql);
  } catch {
    fs.writeFileSync(
      path.join(docsDb, 'schema-current.sql.snapshot'),
      `-- sqlite3 CLI not available; tableColumnHash=${fp.tableColumnHash}\n`,
    );
  }
}

console.log('[db:fingerprint] wrote', FINGERPRINT_JSON_PATH);
console.log('[db:fingerprint] schemaPrismaHash', readSchemaPrismaHash());
console.log('[db:fingerprint] tableColumnHash', fp.tableColumnHash);
console.log('[db:fingerprint] migrationFoldersHash', hashMigrationFolders());
