#!/usr/bin/env node
/**
 * Schema freeze preflight — fails when schema/migration/fingerprint rules are violated.
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CORE = path.join(REPO_ROOT, 'apps', 'core', 'cardbey-core');
const SCHEMA = path.join(CORE, 'prisma', 'sqlite', 'schema.prisma');
const MIGRATIONS = path.join(CORE, 'prisma', 'migrations');
const FINGERPRINT = path.join(CORE, 'docs', 'db', 'schema-fingerprint.json');

/** @type {string[]} */
let errors = [];
/** @type {string[]} */
let warnings = [];

function gitLines(cmd) {
  try {
    return execSync(cmd, { cwd: REPO_ROOT, encoding: 'utf8' })
      .trim()
      .split('\n')
      .filter(Boolean);
  } catch {
    return [];
  }
}

const staged = gitLines('git diff --cached --name-only');
const unstaged = gitLines('git diff --name-only');

// Hard-fail only on staged changes (pre-commit / CI staged mode).
const schemaChanged = staged.some(
  (f) =>
    f.includes('prisma/sqlite/schema.prisma') ||
    f.includes('prisma/postgres/schema.prisma') ||
    f.endsWith('prisma/schema.prisma'),
);
const migrationChanged = staged.some((f) => f.includes('prisma/migrations/') && f.includes('migration.sql'));
const fingerprintChanged = staged.some((f) => f.includes('docs/db/schema-fingerprint.json'));

if (unstaged.some((f) => f.includes('prisma/sqlite/schema.prisma'))) {
  warnings.push('Unstaged schema.prisma changes — run db:fingerprint before commit');
}

if (schemaChanged && !migrationChanged && !fingerprintChanged) {
  errors.push(
    'schema.prisma changed without a new migration folder or schema-fingerprint.json update. See docs/SCHEMA_FREEZE.md',
  );
}

if (migrationChanged && !fingerprintChanged) {
  warnings.push(
    'Migration SQL changed without docs/db/schema-fingerprint.json update — run: cd apps/core/cardbey-core && npm run db:fingerprint',
  );
}

// Dashboard DATABASE_URL
const dash = path.join(REPO_ROOT, 'apps', 'dashboard', 'cardbey-marketing-dashboard');
for (const envFile of ['.env', '.env.example', '.env.local']) {
  const p = path.join(dash, envFile);
  if (fs.existsSync(p) && /^\s*DATABASE_URL\s*=/m.test(fs.readFileSync(p, 'utf8'))) {
    errors.push(`Dashboard must not define DATABASE_URL: ${envFile}`);
  }
}

// Ghost DBs
const ghostMarkers = ['prisma\\prisma\\dev.db', 'prisma/sqlite/prisma/dev.db'];
for (const marker of ghostMarkers) {
  const p = path.join(CORE, marker.replace(/\//g, path.sep));
  if (fs.existsSync(p)) {
    errors.push(`Ghost SQLite file exists (delete locally): ${path.relative(REPO_ROOT, p)}`);
  }
}

// Render SQLite check
const renderYaml = path.join(CORE, 'render.yaml');
if (fs.existsSync(renderYaml)) {
  const y = fs.readFileSync(renderYaml, 'utf8');
  if (/DATABASE_URL.*file:/i.test(y) || /sqlite/i.test(y) && /value:\s*file:/i.test(y)) {
    errors.push('render.yaml must not configure SQLite DATABASE_URL for production');
  }
}

if (!fs.existsSync(FINGERPRINT)) {
  warnings.push('Missing committed docs/db/schema-fingerprint.json — run npm run db:fingerprint in cardbey-core');
}

console.log('[schema-freeze-guard] staged:', staged.length, 'unstaged:', unstaged.length);
for (const w of warnings) console.warn('[schema-freeze-guard] WARN:', w);
for (const e of errors) console.error('[schema-freeze-guard] FAIL:', e);

if (errors.length) process.exit(1);
console.log('[schema-freeze-guard] OK');
