#!/usr/bin/env node
/**
 * Preflight: detect obvious leaked API keys in repo files (tracked + untracked).
 * Does not print secret values — only paths and rule names.
 *
 * Usage: node scripts/scan-secrets.mjs [--staged]
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { REPO_ROOT } from './dev-constants.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const IGNORE_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  'coverage',
  'playwright-report',
  'test-results',
  '.turbo',
  '.pnpm-store',
]);

const IGNORE_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.woff', '.woff2', '.ttf', '.eot', '.zip', '.pdf', '.db', '.sqlite', '.wasm']);

/** Paths that may contain example/fake keys for tests. */
const ALLOW_PATH_SUBSTRINGS = [
  'scan-secrets.mjs',
  'i18nContract.test.ts',
  '.env.example',
  'ENV.example',
  'example.env',
];

const PLACEHOLDER_LINE = /sk-\.\.\.|sk-test|sk-fake|sk-xxxx|your[_ -]?key|REDACTED|placeholder|example/i;

const RULES = [
  { id: 'anthropic-sk-ant', re: /sk-ant-api[0-9A-Za-z_-]{12,}/ },
  { id: 'openai-sk-long', re: /\bsk-[A-Za-z0-9]{24,}\b/ },
  { id: 'anthropic-env-assign', re: /ANTHROPIC_API_KEY\s*=\s*["']?sk-[A-Za-z0-9]{20,}/i },
  { id: 'openai-env-assign', re: /OPENAI_API_KEY\s*=\s*["']?sk-[A-Za-z0-9]{20,}/i },
  { id: 'powershell-env-key', re: /\$env:ANTHROPIC_API_KEY\s*=\s*["']sk-[A-Za-z0-9]{20,}/i },
];

function isAllowed(relPath) {
  const norm = relPath.replace(/\\/g, '/');
  if (ALLOW_PATH_SUBSTRINGS.some((s) => norm.includes(s))) return true;
  if (norm.endsWith('.md') && norm.includes('docs/') && norm.includes('EXAMPLE')) return true;
  return false;
}

function listFilesFromGit(stagedOnly) {
  try {
    if (stagedOnly) {
      const out = execSync('git diff --cached --name-only --diff-filter=ACMR', {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'ignore'],
      });
      return out.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    }
    const tracked = execSync('git ls-files', {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore'],
    });
    const untracked = execSync('git ls-files --others --exclude-standard', {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore'],
    });
    const set = new Set();
    for (const block of [tracked, untracked]) {
      for (const line of block.split(/\r?\n/)) {
        const t = line.trim();
        if (t) set.add(t);
      }
    }
    return [...set];
  } catch {
    return null;
  }
}

function walkDir(dir, base, acc) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const ent of entries) {
    if (IGNORE_DIRS.has(ent.name)) continue;
    const full = path.join(dir, ent.name);
    const rel = path.join(base, ent.name).replace(/\\/g, '/');
    if (ent.isDirectory()) {
      walkDir(full, rel, acc);
      continue;
    }
    const ext = path.extname(ent.name).toLowerCase();
    if (IGNORE_EXT.has(ext)) continue;
    acc.push(rel);
  }
}

function collectTargetFiles(stagedOnly) {
  const fromGit = listFilesFromGit(stagedOnly);
  if (fromGit && fromGit.length > 0) {
    return fromGit.filter((f) => !isAllowed(f));
  }
  const acc = [];
  walkDir(REPO_ROOT, '', acc);
  return acc.filter((f) => !isAllowed(f));
}

function scanFile(relPath) {
  const full = path.join(REPO_ROOT, relPath);
  let stat;
  try {
    stat = fs.statSync(full);
  } catch {
    return [];
  }
  if (!stat.isFile() || stat.size > 2_000_000) return [];

  let text;
  try {
    text = fs.readFileSync(full, 'utf8');
  } catch {
    return [];
  }

  const hits = [];
  const lines = text.split(/\r?\n/);
  for (const rule of RULES) {
    for (const line of lines) {
      if (PLACEHOLDER_LINE.test(line)) continue;
      if (rule.re.test(line)) {
        hits.push(rule.id);
        break;
      }
    }
    rule.re.lastIndex = 0;
  }
  return hits;
}

function main() {
  const stagedOnly = process.argv.includes('--staged');
  const files = collectTargetFiles(stagedOnly);
  const findings = [];

  for (const rel of files) {
    const rules = scanFile(rel);
    if (rules.length > 0) findings.push({ path: rel, rules });
  }

  console.log('🔐 Cardbey secret preflight\n');
  console.log(`Scanned ${files.length} file(s)${stagedOnly ? ' (staged)' : ''} under ${REPO_ROOT}\n`);

  if (findings.length === 0) {
    console.log('✅ No obvious leaked API keys detected.');
    process.exit(0);
  }

  console.log(`❌ ${findings.length} file(s) matched secret patterns:\n`);
  for (const f of findings) {
    console.log(`  - ${f.path}`);
    console.log(`    rules: ${f.rules.join(', ')}`);
  }
  console.log('\nRemove secrets from the repo, rotate the key, and add paths to .gitignore if needed.');
  console.log('Known example: apps/core/cardbey-core/src/test/Supercopipot command..txt');
  process.exit(1);
}

main();
