#!/usr/bin/env node
/**
 * Authenticated init of the private dashboard submodule (Architecture A fallback).
 *
 * Preferred live deploy path is Architecture B (clone DanPCB/cardbey-marketing-dashboard
 * directly). Use this script only when a parent-repo build must materialize the submodule.
 *
 * Requires Actions secret CARDBEY_SUBMODULE_TOKEN (read-only on the dashboard repo).
 * GITHUB_SUBMODULE_TOKEN remains a Render/local alias. Never prints the token or remotes.
 *
 * Usage:
 *   CARDBEY_SUBMODULE_TOKEN=... node scripts/init-private-dashboard-submodule.mjs
 *
 * Env:
 *   CARDBEY_INIT_DASHBOARD_SUBMODULE=false → no-op exit 0 (no clone)
 *   token missing when init enabled → fail-fast exit 1
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildGithubHttpsInsteadOfUrl,
  shouldInitDashboardSubmodule,
  validateSubmoduleToken,
} from './privateDashboardSubmoduleAuth.mjs';

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const submoduleRel = 'apps/dashboard/cardbey-marketing-dashboard';

function log(msg) {
  console.log(`[dashboard-submodule] ${msg}`);
}

function runGit(args, opts = {}) {
  execFileSync('git', args, {
    cwd: repoRoot,
    stdio: opts.silent ? 'pipe' : 'inherit',
    env: process.env,
  });
}

export function main(env = process.env) {
  if (!shouldInitDashboardSubmodule(env)) {
    log('skip (CARDBEY_INIT_DASHBOARD_SUBMODULE is not true) — no git clone attempted');
    return { status: 'skipped' };
  }

  const tokenCheck = validateSubmoduleToken(env);
  if (!tokenCheck.ok) {
    console.error(`[dashboard-submodule] FATAL: ${tokenCheck.message}`);
    console.error(
      '[dashboard-submodule] Required configuration: set Actions secret CARDBEY_SUBMODULE_TOKEN (GitHub forbids custom GITHUB_* secret names)',
    );
    console.error(
      '[dashboard-submodule] Or deploy the static site directly from DanPCB/cardbey-marketing-dashboard (preferred).',
    );
    process.exitCode = 1;
    return { status: 'missing_token' };
  }

  const token = tokenCheck.token;
  const insteadOf = buildGithubHttpsInsteadOfUrl(token);
  const rewriteKey = `url.${insteadOf}.insteadOf`;

  log('authenticating private dashboard submodule (token not logged)');
  try {
    runGit(['config', '--global', rewriteKey, 'https://github.com/']);
    runGit(['submodule', 'sync', '--', submoduleRel], { silent: true });
    runGit(['submodule', 'update', '--init', '--depth', '1', '--', submoduleRel]);
  } finally {
    try {
      runGit(['config', '--global', '--unset-all', rewriteKey], { silent: true });
    } catch {
      /* ignore cleanup failures */
    }
  }

  const probe = path.join(repoRoot, submoduleRel, 'package.json');
  if (!fs.existsSync(probe)) {
    console.error('[dashboard-submodule] FATAL: submodule init finished but package.json missing');
    process.exitCode = 1;
    return { status: 'incomplete' };
  }

  // Honest completion: package.json materialization is the side-effect evidence.
  log(`initialized (${submoduleRel}/package.json present)`);
  return { status: 'initialized', evidence: 'package.json', path: submoduleRel };
}

const isDirectRun =
  process.argv[1] &&
  path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1]);

if (isDirectRun) {
  main();
}
