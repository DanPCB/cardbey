#!/usr/bin/env node
/**
 * Render build wrapper — purge stale esbuild from cache before npm ci.
 * Fixes: Expected "0.27.3" but got "0.25.12" when Render reuses cached node_modules.
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(root, '..');
process.chdir(projectRoot);

function rmSafe(target) {
  try {
    fs.rmSync(target, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}

function purgeStaleEsbuild() {
  rmSafe(path.join(projectRoot, 'node_modules', 'esbuild'));
  const esbuildScope = path.join(projectRoot, 'node_modules', '@esbuild');
  try {
    for (const name of fs.readdirSync(esbuildScope)) {
      rmSafe(path.join(esbuildScope, name));
    }
  } catch {
    /* @esbuild scope missing */
  }
  console.log('[render-build] purged esbuild cache artifacts');
}

function run(cmd) {
  console.log('[render-build]', cmd);
  execSync(cmd, { stdio: 'inherit', env: process.env, shell: true });
}

purgeStaleEsbuild();
run('npm install --prefix ../../../packages/template-engine');
run('npm run build --prefix ../../../packages/template-engine');
run('npm ci');
run('npm rebuild esbuild');
run('npm run build');

const pip = 'pip install crewai crewai-tools --quiet || echo "pip not available, CrewAI disabled"';
try {
  run(pip);
} catch {
  console.warn('[render-build] pip step failed (non-fatal)');
}

console.log('[render-build] done');
