#!/usr/bin/env node
/**
 * Authenticated init of the private dashboard submodule (Architecture A fallback).
 *
 * Requires Actions secret CARDBEY_SUBMODULE_TOKEN (read-only on the dashboard repo).
 * GITHUB_SUBMODULE_TOKEN remains a Render/local alias. Never prints the token or remotes.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  redactGithubTokenUrl,
  shouldInitDashboardSubmodule,
  validateSubmoduleToken,
} from './privateDashboardSubmoduleAuth.mjs';

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const submoduleRel = 'apps/dashboard/cardbey-marketing-dashboard';
const dashAbs = path.join(repoRoot, submoduleRel);
const DASHBOARD_CLONE_HOST_PATH = 'github.com/DanPCB/cardbey-marketing-dashboard.git';

function log(msg) {
  console.log(`[dashboard-submodule] ${msg}`);
}

function runGit(args, opts = {}) {
  return execFileSync('git', args, {
    cwd: opts.cwd || repoRoot,
    encoding: 'utf8',
    stdio: opts.silent ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  });
}

function redact(text) {
  return redactGithubTokenUrl(String(text || '')).replace(/x-access-token:[^@\s]+/gi, 'x-access-token:***');
}

function expectedGitlinkSha() {
  const ls = runGit(['ls-tree', 'HEAD', submoduleRel], { silent: true }).trim();
  const m = ls.match(/\b([0-9a-f]{40})\b/);
  if (!m) {
    throw new Error(`could not parse gitlink SHA from: ${ls || '(empty)'}`);
  }
  return m[1];
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
    process.exitCode = 1;
    return { status: 'missing_token' };
  }

  let expected;
  try {
    expected = expectedGitlinkSha();
  } catch (err) {
    console.error(`[dashboard-submodule] FATAL: ${err?.message || err}`);
    process.exitCode = 1;
    return { status: 'gitlink_parse_failed' };
  }
  log(`expected_gitlink=${expected}`);

  try {
    runGit(['config', '--local', '--unset-all', 'http.https://github.com/.extraheader'], { silent: true });
  } catch {
    /* extraheader not present */
  }

  fs.mkdirSync(dashAbs, { recursive: true });
  const gitDir = path.join(dashAbs, '.git');
  if (!fs.existsSync(gitDir)) {
    runGit(['init'], { cwd: dashAbs, silent: true });
  }

  const authUrl = `https://x-access-token:${tokenCheck.token}@${DASHBOARD_CLONE_HOST_PATH}`;
  try {
    try {
      runGit(['remote', 'remove', 'origin'], { cwd: dashAbs, silent: true });
    } catch {
      /* no origin yet */
    }
    execFileSync('git', ['remote', 'add', 'origin', authUrl], {
      cwd: dashAbs,
      stdio: 'pipe',
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
    });
    execFileSync('git', ['fetch', '--depth', '1', 'origin', expected], {
      cwd: dashAbs,
      stdio: 'pipe',
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
    });
    runGit(['checkout', '--detach', 'FETCH_HEAD'], { cwd: dashAbs, silent: true });
    execFileSync(
      'git',
      ['remote', 'set-url', 'origin', `https://${DASHBOARD_CLONE_HOST_PATH}`],
      { cwd: dashAbs, stdio: 'pipe' },
    );
  } catch (err) {
    const raw = `${err?.stderr || ''} ${err?.message || err}`;
    const safe = redact(raw);
    console.error('[dashboard-submodule] FATAL: authenticated fetch of gitlink SHA failed');
    console.error(`[dashboard-submodule] target_repo=DanPCB/cardbey-marketing-dashboard`);
    console.error(`[dashboard-submodule] secret_name=CARDBEY_SUBMODULE_TOKEN secret_present=true`);
    if (/403|not found|Permission|denied/i.test(safe)) {
      console.error(
        '[dashboard-submodule] mismatch=token_cannot_read_private_dashboard (HTTP 403). Token is visible to this workflow but GitHub denies it for DanPCB/cardbey-marketing-dashboard. Typical causes: fine-grained PAT resource list omits that repo; missing contents:read; classic PAT missing repo scope; SSO not authorized. Not an Environment mismatch (none configured).',
      );
    }
    console.error(safe);
    process.exitCode = 1;
    return { status: 'clone_forbidden' };
  }

  const actual = runGit(['rev-parse', 'HEAD'], { cwd: dashAbs, silent: true }).trim();
  log(`actual_checkout=${actual}`);
  if (actual !== expected) {
    console.error(`[dashboard-submodule] FATAL: SHA mismatch expected ${expected} got ${actual}`);
    process.exitCode = 1;
    return { status: 'sha_mismatch' };
  }

  const probe = path.join(dashAbs, 'package.json');
  if (!fs.existsSync(probe)) {
    console.error('[dashboard-submodule] FATAL: checkout finished but package.json missing');
    process.exitCode = 1;
    return { status: 'incomplete' };
  }

  log(`initialized (${submoduleRel}/package.json present)`);
  return { status: 'initialized', evidence: 'package.json', path: submoduleRel, sha: actual };
}

const isDirectRun =
  process.argv[1] &&
  path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1]);

if (isDirectRun) {
  main();
}
