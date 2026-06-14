#!/usr/bin/env node
/**
 * Migration script — update legacy routing flags in client/dashboard code.
 * Run: node scripts/migrate-endpoint-routing.mjs [--dry-run]
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../../..');

const MIGRATIONS = [
  {
    pattern: /direct_action:\s*true/g,
    replace: "/* direct_action removed — use endpoint routing */",
    note: 'Removed direct_action flag',
  },
  {
    pattern: /skipDirectGuard:\s*true/g,
    replace: '/* skipDirectGuard removed — kernel mandatory */',
    note: 'Removed skipDirectGuard flag',
  },
  {
    pattern: /_autoSubmit:\s*true/g,
    replace: 'requireConfirmation: true',
    note: 'Auto-submit replaced with confirmation',
  },
];

const SCAN_DIRS = [
  path.join(repoRoot, 'apps/dashboard'),
  path.join(repoRoot, 'apps/core/cardbey-core/src'),
];

const EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx', '.mjs']);

function walk(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, files);
    else if (EXTENSIONS.has(path.extname(entry.name))) files.push(full);
  }
  return files;
}

function migrateFile(filePath, dryRun) {
  let content = fs.readFileSync(filePath, 'utf8');
  let modified = false;
  const notes = [];

  for (const migration of MIGRATIONS) {
    if (migration.pattern.test(content)) {
      content = content.replace(migration.pattern, migration.replace);
      modified = true;
      notes.push(migration.note);
      migration.pattern.lastIndex = 0;
    }
  }

  if (modified) {
    const rel = path.relative(repoRoot, filePath);
    console.log(`  ✓ ${rel}`);
    for (const note of notes) console.log(`      ${note}`);
    if (!dryRun) fs.writeFileSync(filePath, content, 'utf8');
  }

  return modified;
}

function main() {
  const dryRun = process.argv.includes('--dry-run');
  console.log(`Migrating endpoint routing flags${dryRun ? ' (dry run)' : ''}...`);

  let changed = 0;
  for (const dir of SCAN_DIRS) {
    for (const file of walk(dir)) {
      if (migrateFile(file, dryRun)) changed += 1;
    }
  }

  console.log(`\nDone. ${changed} file(s) ${dryRun ? 'would be ' : ''}updated.`);
}

main();
