#!/usr/bin/env node
/**
 * CI guard: dashboard submodule working tree must match the parent gitlink SHA.
 * Prints SHAs only (never remotes/tokens). Exits non-zero on mismatch or empty tree.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const dashRel = 'apps/dashboard/cardbey-marketing-dashboard';
const dashAbs = path.join(repoRoot, dashRel);

function git(args, cwd = repoRoot) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

function fail(msg) {
  console.error(`[ci-assert-dashboard-submodule] ${msg}`);
  process.exit(1);
}

if (!fs.existsSync(path.join(dashAbs, 'package.json'))) {
  fail(`dashboard package.json missing at ${dashRel} (submodule not checked out?)`);
}

let expected;
try {
  const ls = git(['ls-tree', 'HEAD', dashRel]);
  // "160000 commit <sha>\tpath"
  const m = ls.match(/\b([0-9a-f]{40})\b/);
  if (!m) fail(`could not parse gitlink SHA from: ${ls || '(empty)'}`);
  expected = m[1];
} catch (err) {
  fail(`git ls-tree failed: ${err?.message || err}`);
}

let actual;
try {
  actual = git(['rev-parse', 'HEAD'], dashAbs);
} catch (err) {
  fail(`dashboard rev-parse failed: ${err?.message || err}`);
}

console.log(`[ci-assert-dashboard-submodule] expected_gitlink=${expected}`);
console.log(`[ci-assert-dashboard-submodule] actual_checkout=${actual}`);

if (actual !== expected) {
  fail(`dashboard SHA mismatch: expected ${expected}, got ${actual}`);
}

console.log('[ci-assert-dashboard-submodule] ok');
