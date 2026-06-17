#!/usr/bin/env node
/**
 * Monorepo-safe Render pre-deploy for cardbey-core-staging.
 * Use when the Render service root is the cardbey repo (not apps/core/cardbey-core).
 *
 * Dashboard pre-deploy command:
 *   node scripts/render-core-predeploy.mjs
 */
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const coreRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'apps', 'core', 'cardbey-core');

function run(cmd) {
  console.log('[render-core-predeploy]', cmd);
  execSync(cmd, { cwd: coreRoot, stdio: 'inherit', env: process.env, shell: true });
}

run('npm ci');
run('node scripts/resolve-postgres-failed-migration.mjs');
run('node scripts/prisma-bootstrap.js');
console.log('[render-core-predeploy] done');
