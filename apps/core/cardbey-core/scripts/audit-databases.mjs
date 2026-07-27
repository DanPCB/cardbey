#!/usr/bin/env node
/**
 * Audit all SQLite DB files and compare to process DATABASE_URL resolution.
 * Run from apps/core/cardbey-core: npm run db:audit
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = path.join(__dirname, '..');

// Load .env like server
const envPath = path.join(PACKAGE_ROOT, '.env');
if (fs.existsSync(envPath)) {
  const dotenv = await import('dotenv');
  dotenv.config({ path: envPath, override: true });
}
if (!process.env.DATABASE_URL?.startsWith('file:')) {
  process.env.DATABASE_URL = 'file:../dev.db';
}

function getPathFromFileUrl(url) {
  if (!url?.toLowerCase().startsWith('file:')) return null;
  let p = url.slice(5).trim();
  if (/^[A-Za-z]:\//i.test(p)) return path.normalize(p.replace(/\//g, path.sep));
  if (p.startsWith('/') && !p.startsWith('//')) return path.normalize(p);
  p = p.replace(/^\.\//, '').replace(/^\/+/, '');
  const posix = p.replace(/\\/g, '/');
  if (posix === '../dev.db') return path.join(PACKAGE_ROOT, 'prisma', 'dev.db');
  if (posix === '../test.db') return path.join(PACKAGE_ROOT, 'prisma', 'test.db');
  if (posix === '../prod.db') return path.join(PACKAGE_ROOT, 'prisma', 'prod.db');
  return p ? path.resolve(PACKAGE_ROOT, p.replace(/\//g, path.sep)) : null;
}

function inspectDb(absolutePath) {
  if (!fs.existsSync(absolutePath)) {
    return { exists: false };
  }
  const stat = fs.statSync(absolutePath);
  const out = {
    exists: true,
    sizeBytes: stat.size,
    mtime: stat.mtime.toISOString(),
  };
  try {
    const db = new DatabaseSync(absolutePath, { readonly: true });
    const cols = db
      .prepare('PRAGMA table_info("DraftStore")')
      .all()
      .map((r) => r.name);
    out.draftStoreColumns = cols;
    out.hasPublishSnapshot = cols.includes('publishSnapshot');
    out.hasPublishSnapshotVersion = cols.includes('publishSnapshotVersion');
    try {
      const migs = db
        .prepare('SELECT migration_name, finished_at FROM _prisma_migrations ORDER BY finished_at DESC LIMIT 5')
        .all();
      out.migrationCount = db.prepare('SELECT COUNT(*) AS c FROM _prisma_migrations').get()?.c ?? 0;
      out.latestMigrations = migs.map((m) => m.migration_name);
    } catch {
      out.migrationCount = 0;
      out.latestMigrations = [];
    }
    try {
      out.draftStoreRowCount = db.prepare('SELECT COUNT(*) AS c FROM DraftStore').get()?.c ?? 0;
    } catch {
      out.draftStoreRowCount = null;
    }
    db.close();
  } catch (e) {
    out.inspectError = e?.message || String(e);
  }
  return out;
}

function findDbFiles(dir, acc = [], depth = 0) {
  if (depth > 8) return acc;
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const ent of entries) {
    if (ent.name === 'node_modules' || ent.name === '.git') continue;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) findDbFiles(full, acc, depth + 1);
    else if (/\.(db|sqlite|sqlite3)$/i.test(ent.name)) acc.push(full);
  }
  return acc;
}

const databaseUrl = process.env.DATABASE_URL ?? '(not set)';
const resolvedDbPath = getPathFromFileUrl(databaseUrl);

console.log(JSON.stringify(
  {
    tag: 'DB_AUDIT',
    processCwd: process.cwd(),
    packageRoot: PACKAGE_ROOT,
    nodeEnv: process.env.NODE_ENV ?? null,
    databaseUrl,
    resolvedDbPath,
    resolvedExists: resolvedDbPath ? fs.existsSync(resolvedDbPath) : false,
    resolvedInspect: resolvedDbPath ? inspectDb(resolvedDbPath) : null,
    prismaClientGen: path.join(PACKAGE_ROOT, 'node_modules', '.prisma', 'client-gen'),
    prismaClientGenExists: fs.existsSync(path.join(PACKAGE_ROOT, 'node_modules', '.prisma', 'client-gen')),
  },
  null,
  2,
));

const allDbs = findDbFiles(PACKAGE_ROOT);
const canonicalDev = path.join(PACKAGE_ROOT, 'prisma', 'dev.db');
const canonicalTest = path.join(PACKAGE_ROOT, 'prisma', 'test.db');

console.log('\n--- All .db files under package root ---\n');
for (const fp of allDbs.sort()) {
  const rel = path.relative(PACKAGE_ROOT, fp);
  const inspect = inspectDb(fp);
  const isCanonical = path.resolve(fp) === path.resolve(canonicalDev) ? 'CANONICAL_DEV' : path.resolve(fp) === path.resolve(canonicalTest) ? 'CANONICAL_TEST' : 'OTHER';
  console.log(JSON.stringify({ rel, isCanonical, ...inspect }, null, 2));
}
