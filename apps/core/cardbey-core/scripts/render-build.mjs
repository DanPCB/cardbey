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

// Language agent + i18n tools read dashboard src/i18n.js from the monorepo submodule.
// Core deploys historically skipped submodule init → empty path → /api/language/scan 500.
function initDashboardSubmodule() {
  const monorepoRoot = path.resolve(projectRoot, '../../..');
  const submoduleRel = 'apps/dashboard/cardbey-marketing-dashboard';
  const i18nProbe = path.join(monorepoRoot, submoduleRel, 'src/i18n.js');
  if (fs.existsSync(i18nProbe)) {
    console.log('[render-build] dashboard submodule already present');
    return;
  }
  if (!fs.existsSync(path.join(monorepoRoot, '.gitmodules'))) {
    console.warn('[render-build] no .gitmodules at', monorepoRoot, '— skip submodule init');
    return;
  }
  // Private submodule needs credentials Render core often lacks.
  // Prefer committed language-seed; skip noisy git clone attempts unless explicitly enabled.
  if (String(process.env.CARDBEY_INIT_DASHBOARD_SUBMODULE || '').toLowerCase() !== 'true') {
    console.warn(
      '[render-build] skip dashboard submodule init (set CARDBEY_INIT_DASHBOARD_SUBMODULE=true to enable); language-seed covers /api/language/scan',
    );
    return;
  }
  try {
    console.log('[render-build] init dashboard submodule for language agent');
    execSync(`git submodule update --init --depth 1 ${submoduleRel}`, {
      cwd: monorepoRoot,
      stdio: 'inherit',
      env: process.env,
      shell: true,
    });
  } catch (err) {
    console.warn(
      '[render-build] dashboard submodule init failed (language agent may use language-seed):',
      err?.message ?? err,
    );
  }
}

initDashboardSubmodule();
run('npm install --prefix ../../../packages/template-engine');
run('npm run build --prefix ../../../packages/template-engine');
run('npm ci');
run('npm rebuild esbuild');
run('node scripts/write-build-metadata.mjs');
run('npm run build');

// CrewAI is optional. Calling `pip install` on Render triggers Python 3.14 + Poetry,
// then tiktoken builds from source (needs Rust) and fails. Skip entirely on Render.
const onRender = Boolean(process.env.RENDER || process.env.RENDER_SERVICE_ID);
if (onRender || String(process.env.SKIP_CREWAI_INSTALL || '').toLowerCase() === 'true') {
  console.log('[render-build] skip CrewAI pip install (Render/Python 3.14 tiktoken unsafe)');
} else {
  const pip = 'pip install crewai crewai-tools --quiet || echo "pip not available, CrewAI disabled"';
  try {
    run(pip);
  } catch {
    console.warn('[render-build] pip step failed (non-fatal)');
  }
}

console.log('[render-build] done');
