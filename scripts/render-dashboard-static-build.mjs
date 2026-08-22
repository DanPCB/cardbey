#!/usr/bin/env node
/**
 * Render static-site build for cardbey-dashboard* (Architecture A: parent monorepo).
 *
 * Render auto-clones .gitmodules before this script. The dashboard submodule URL must be
 * relative (../cardbey-marketing-dashboard.git) so that clone reuses parent credentials.
 *
 * Fail-fast if the private submodule did not materialize — do not retry unauthenticated HTTPS.
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const submoduleRel = 'apps/dashboard/cardbey-marketing-dashboard';
const probe = path.join(repoRoot, submoduleRel, 'package.json');
const gitmodules = path.join(repoRoot, '.gitmodules');

const modeArg = process.argv.find((a) => a.startsWith('--mode='));
const mode = modeArg?.split('=')[1] || 'production';
const filterScript = mode === 'staging' ? 'build:staging' : 'build';

function log(msg) {
  console.log(`[render-dashboard-static] ${msg}`);
}

function run(cmd) {
  log(`run: ${cmd}`);
  execSync(cmd, { cwd: repoRoot, stdio: 'inherit', env: process.env, shell: true });
}

function assertRelativeSubmoduleUrl() {
  if (!fs.existsSync(gitmodules)) {
    console.error('[render-dashboard-static] FATAL: .gitmodules missing');
    process.exit(1);
  }
  const raw = fs.readFileSync(gitmodules, 'utf8');
  if (/url\s*=\s*https:\/\/github\.com\/DanPCB\/cardbey-marketing-dashboard/.test(raw)) {
    console.error(
      '[render-dashboard-static] FATAL: Private dashboard source is unavailable.',
    );
    console.error(
      '[render-dashboard-static] Cause: .gitmodules uses absolute HTTPS; Render auto-clone cannot auth nested private repos.',
    );
    console.error(
      '[render-dashboard-static] Required configuration: submodule url = ../cardbey-marketing-dashboard.git',
    );
    process.exit(1);
  }
  if (!/url\s*=\s*\.\.\/cardbey-marketing-dashboard\.git/.test(raw)) {
    console.error(
      '[render-dashboard-static] FATAL: expected relative submodule url ../cardbey-marketing-dashboard.git',
    );
    process.exit(1);
  }
}

function ensureSubmodulePresent() {
  if (fs.existsSync(probe)) {
    log('dashboard submodule present');
    return;
  }

  log('dashboard submodule missing after checkout — sync + init once (relative URL)');
  try {
    run(`git submodule sync -- ${submoduleRel}`);
    run(`git submodule update --init --depth 1 -- ${submoduleRel}`);
  } catch {
    console.error('[render-dashboard-static] FATAL: Private dashboard source is unavailable.');
    console.error(
      '[render-dashboard-static] Cause: Missing authenticated access for dashboard repository during submodule clone.',
    );
    console.error(
      '[render-dashboard-static] Required configuration: relative .gitmodules URL and Render Git credentials that can read DanPCB/cardbey (parent).',
    );
    console.error(
      '[render-dashboard-static] Do not retry unauthenticated https://github.com/DanPCB/cardbey-marketing-dashboard clones.',
    );
    process.exit(1);
  }

  if (!fs.existsSync(probe)) {
    console.error('[render-dashboard-static] FATAL: submodule init finished but package.json missing');
    process.exit(1);
  }
}

function resolveParentCommitSha() {
  const fromEnv = String(
    process.env.RENDER_GIT_COMMIT ||
      process.env.VITE_PARENT_COMMIT_SHA ||
      process.env.VITE_APP_COMMIT_SHA ||
      '',
  ).trim();
  if (fromEnv) return fromEnv;
  try {
    return execSync('git rev-parse HEAD', { cwd: repoRoot, encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

function resolveDashboardCommitSha() {
  try {
    return execSync('git rev-parse HEAD', {
      cwd: path.join(repoRoot, submoduleRel),
      encoding: 'utf8',
    }).trim();
  } catch {
    return '';
  }
}

log(`start mode=${mode}`);
process.chdir(repoRoot);
assertRelativeSubmoduleUrl();
ensureSubmodulePresent();

// Bake monorepo SHA into the SPA so deploy handshake matches Core RENDER_GIT_COMMIT.
const parentSha = resolveParentCommitSha();
const dashboardSha = resolveDashboardCommitSha();
process.env.VITE_APP_COMMIT_SHA = parentSha;
process.env.VITE_PARENT_COMMIT_SHA = parentSha;
if (dashboardSha) process.env.VITE_DASHBOARD_COMMIT_SHA = dashboardSha;
log(`bake commit parent=${parentSha.slice(0, 8)} dashboard=${(dashboardSha || 'n/a').slice(0, 8)}`);

run('npm i -g pnpm@10.25.0');
run('pnpm -v');
run('pnpm install --frozen-lockfile');
run(`pnpm --filter @cardbey/dashboard run ${filterScript}`);

const distIndex = path.join(repoRoot, submoduleRel, 'dist', 'index.html');
if (!fs.existsSync(distIndex)) {
  console.error(`[render-dashboard-static] FATAL: missing ${distIndex}`);
  process.exit(1);
}
log('done');
