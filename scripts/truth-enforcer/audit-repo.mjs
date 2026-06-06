#!/usr/bin/env node
/**
 * Full-repo truth audit — prints files with errors/warnings.
 * Usage: node scripts/truth-enforcer/audit-repo.mjs
 *        node scripts/truth-enforcer/audit-repo.mjs --json
 */

import { spawnSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const script = path.join(__dirname, 'index.mjs');
const jsonMode = process.argv.includes('--json');

const result = spawnSync(
  process.execPath,
  [script, '--audit', '--json', '--quiet', ...(process.argv.includes('--strict') ? ['--strict'] : [])],
  { encoding: 'utf-8', maxBuffer: 64 * 1024 * 1024 },
);

const raw = (result.stdout || '').trim() || '[]';
let violations = [];
try {
  violations = JSON.parse(raw);
} catch {
  console.error('Failed to parse audit output');
  process.exit(1);
}

if (jsonMode) {
  console.log(JSON.stringify(violations, null, 2));
  process.exit(violations.filter((v) => v.severity === 'error').length > 0 ? 1 : 0);
}

const errors = violations.filter((v) => v.severity === 'error');
const warnings = violations.filter((v) => v.severity === 'warning');
const byFile = new Map();
for (const v of violations) {
  const key = v.file || 'unknown';
  byFile.set(key, (byFile.get(key) || 0) + 1);
}

console.log('=== Cardbey Truth Audit ===\n');
console.log(`Errors:   ${errors.length}`);
console.log(`Warnings: ${warnings.length}`);
console.log(`Score:    ${Math.max(0, Math.min(100, 100 - errors.length * 3 - warnings.length))}%\n`);

if (violations.length === 0) {
  console.log('✅ No violations found.');
  process.exit(0);
}

console.log('Top files by violation count:');
[...byFile.entries()]
  .sort((a, b) => b[1] - a[1])
  .slice(0, 15)
  .forEach(([file, count]) => console.log(`  ${count}x  ${file}`));

console.log('\nSample violations:');
for (const v of violations.slice(0, 25)) {
  console.log(`  [${v.severity}] ${v.file}:${v.line ?? '?'} ${v.pattern} — ${v.message}`);
}
if (violations.length > 25) {
  console.log(`  ... and ${violations.length - 25} more`);
}

process.exit(errors.length > 0 ? 1 : 0);
