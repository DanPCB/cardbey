/**
 * Maintenance helpers for dashboard i18n auto-sync scripts.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
const CORE_PACKAGE_ROOT = path.resolve(THIS_DIR, '../../..');
const RUNTIME_CACHE_ROOT = path.join(CORE_PACKAGE_ROOT, 'data', 'language-runtime');
/** Committed fallback when Render core deploy has an empty dashboard submodule. */
const LANGUAGE_SEED_ROOT = path.join(CORE_PACKAGE_ROOT, 'data', 'language-seed');

/** @type {string | null} */
let dashboardRootOverride = null;

function getCorePackageRoot() {
  return CORE_PACKAGE_ROOT;
}

function copySeedToRuntimeCache() {
  const fromI18n = path.join(LANGUAGE_SEED_ROOT, 'src/i18n.js');
  const toI18n = path.join(RUNTIME_CACHE_ROOT, 'src/i18n.js');
  fs.mkdirSync(path.dirname(toI18n), { recursive: true });
  fs.copyFileSync(fromI18n, toI18n);

  const fromGlossary = path.join(LANGUAGE_SEED_ROOT, 'scripts/i18n-glossary.json');
  const toGlossary = path.join(RUNTIME_CACHE_ROOT, 'scripts/i18n-glossary.json');
  if (fs.existsSync(fromGlossary)) {
    fs.mkdirSync(path.dirname(toGlossary), { recursive: true });
    fs.copyFileSync(fromGlossary, toGlossary);
  }
}

function getMonorepoRoot() {
  if (process.env.CARDBEY_MONOREPO_ROOT) {
    return path.resolve(process.env.CARDBEY_MONOREPO_ROOT);
  }

  // Walk up from cwd (and from this package) so Render rootDir layouts still resolve.
  const starts = [process.cwd(), CORE_PACKAGE_ROOT];
  for (const start of starts) {
    let dir = path.resolve(start);
    for (let i = 0; i < 8; i += 1) {
      const hasGitmodules = fs.existsSync(path.join(dir, '.gitmodules'));
      const hasDashboardDir = fs.existsSync(
        path.join(dir, 'apps/dashboard/cardbey-marketing-dashboard'),
      );
      if (hasGitmodules || hasDashboardDir) return dir;
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }

  return path.resolve(process.cwd(), '../../..');
}

function candidateDashboardRoots() {
  const root = getMonorepoRoot();
  return [
    dashboardRootOverride,
    process.env.LANGUAGE_DASHBOARD_ROOT
      ? path.resolve(process.env.LANGUAGE_DASHBOARD_ROOT)
      : null,
    path.join(root, 'apps/dashboard/cardbey-marketing-dashboard'),
    path.join(root, 'apps/cardbey-marketing-dashboard'),
    RUNTIME_CACHE_ROOT,
    LANGUAGE_SEED_ROOT,
  ].filter(Boolean);
}

function hasI18nFile(dashboardRoot) {
  return Boolean(dashboardRoot && fs.existsSync(path.join(dashboardRoot, 'src/i18n.js')));
}

export function getDashboardPackageRoot() {
  const candidates = candidateDashboardRoots();
  return candidates.find((p) => hasI18nFile(p)) ?? candidates[0];
}

function githubAuthHeaders() {
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || process.env.GITHUB_PAT;
  if (!token) return {};
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github.raw',
    'User-Agent': 'cardbey-language-agent',
  };
}

function defaultRawUrl(relPath) {
  const owner = process.env.LANGUAGE_I18N_REPO_OWNER || 'DanPCB';
  const repo = process.env.LANGUAGE_I18N_REPO_NAME || 'cardbey-marketing-dashboard';
  const ref = process.env.LANGUAGE_I18N_REF || 'main';
  return `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${relPath}`;
}

async function downloadText(url) {
  const res = await fetch(url, { headers: githubAuthHeaders() });
  if (!res.ok) {
    throw new Error(`Failed to download ${url} (${res.status})`);
  }
  return res.text();
}

/**
 * Ensure dashboard i18n assets exist for language scan/apply.
 * Prefer live submodule → seed copy → GitHub raw fetch.
 * @returns {Promise<{ dashboardRoot: string, source: 'submodule' | 'env' | 'cache' | 'seed' | 'fetched' }>}
 */
export async function ensureDashboardI18nReady() {
  const existing = candidateDashboardRoots().find((p) => hasI18nFile(p));
  if (existing) {
    if (existing === LANGUAGE_SEED_ROOT) {
      // Prefer a writable runtime copy so apply/rollback don't mutate the image seed.
      copySeedToRuntimeCache();
      dashboardRootOverride = RUNTIME_CACHE_ROOT;
      return { dashboardRoot: RUNTIME_CACHE_ROOT, source: 'seed' };
    }
    if (existing === RUNTIME_CACHE_ROOT) {
      dashboardRootOverride = existing;
      return { dashboardRoot: existing, source: 'cache' };
    }
    if (
      process.env.LANGUAGE_DASHBOARD_ROOT &&
      existing === path.resolve(process.env.LANGUAGE_DASHBOARD_ROOT)
    ) {
      return { dashboardRoot: existing, source: 'env' };
    }
    return { dashboardRoot: existing, source: 'submodule' };
  }

  const i18nUrl = process.env.LANGUAGE_I18N_RAW_URL || defaultRawUrl('src/i18n.js');
  const glossaryUrl =
    process.env.LANGUAGE_I18N_GLOSSARY_RAW_URL || defaultRawUrl('scripts/i18n-glossary.json');

  fs.mkdirSync(path.join(RUNTIME_CACHE_ROOT, 'src'), { recursive: true });
  fs.mkdirSync(path.join(RUNTIME_CACHE_ROOT, 'scripts'), { recursive: true });

  try {
    const i18nText = await downloadText(i18nUrl);
    fs.writeFileSync(path.join(RUNTIME_CACHE_ROOT, 'src/i18n.js'), i18nText, 'utf8');

    try {
      const glossaryText = await downloadText(glossaryUrl);
      fs.writeFileSync(
        path.join(RUNTIME_CACHE_ROOT, 'scripts/i18n-glossary.json'),
        glossaryText,
        'utf8',
      );
    } catch (err) {
      console.warn('[i18nMaintenance] glossary fetch skipped:', err?.message ?? err);
    }

    dashboardRootOverride = RUNTIME_CACHE_ROOT;
    console.log('[i18nMaintenance] materialised language-runtime cache from', i18nUrl);
    return { dashboardRoot: RUNTIME_CACHE_ROOT, source: 'fetched' };
  } catch (err) {
    throw new Error(
      `i18n file not found (submodule empty, seed missing, fetch failed: ${err?.message ?? err}). ` +
        'Init apps/dashboard/cardbey-marketing-dashboard or run node scripts/sync-language-seed.mjs',
    );
  }
}

function runNodeScript(scriptName, extraArgs = []) {
  const dashboardRoot = getDashboardPackageRoot();
  const scriptPath = path.join(dashboardRoot, 'scripts', scriptName);

  return new Promise((resolve, reject) => {
    if (!fs.existsSync(scriptPath)) {
      resolve({
        code: 1,
        stdout: '',
        stderr: `script not found: ${scriptPath}`,
        dashboardRoot,
      });
      return;
    }

    const child = spawn(process.execPath, [scriptPath, ...extraArgs], {
      cwd: dashboardRoot,
      env: { ...process.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => {
      stdout += d.toString();
    });
    child.stderr.on('data', (d) => {
      stderr += d.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      resolve({ code: code ?? 1, stdout, stderr, dashboardRoot });
    });
  });
}

/**
 * Run i18n-detect.mjs and return structured gap report.
 */
export async function detectI18nGaps() {
  await ensureDashboardI18nReady().catch(() => null);

  const { code, stdout, stderr, dashboardRoot } = await runNodeScript('i18n-detect.mjs', ['--json']);
  const gapsPath = path.join(dashboardRoot, 'i18n-gaps.json');

  let report = { count: 0, fileCount: 0, items: [] };
  try {
    if (fs.existsSync(gapsPath)) {
      report = JSON.parse(fs.readFileSync(gapsPath, 'utf8'));
    }
  } catch {
    /* ignore parse errors */
  }

  const items = Array.isArray(report.items) ? report.items : [];
  const fileSet = new Set(items.map((i) => i.file));

  return {
    status: code === 0 ? 'ok' : 'failed',
    count: items.length,
    fileCount: fileSet.size,
    items,
    exitCode: code,
    log: stdout || stderr,
    gapsFile: gapsPath,
  };
}

/**
 * Translate gaps (dry-run preview or apply).
 * @param {{ gaps?: object[], dryRun?: boolean }} params
 */
export async function applyI18nTranslations({ gaps, dryRun = false } = {}) {
  await ensureDashboardI18nReady();
  const dashboardRoot = getDashboardPackageRoot();
  const gapsPath = path.join(dashboardRoot, 'i18n-gaps.json');

  if (Array.isArray(gaps) && gaps.length > 0) {
    fs.writeFileSync(
      gapsPath,
      `${JSON.stringify(
        {
          scannedAt: new Date().toISOString(),
          count: gaps.length,
          fileCount: new Set(gaps.map((g) => g.file)).size,
          items: gaps,
        },
        null,
        2,
      )}\n`,
      'utf8',
    );
  }

  const args = dryRun ? ['--dry-run'] : [];
  const { code, stdout, stderr } = await runNodeScript('i18n-translate.mjs', args);

  if (code !== 0 && !dryRun) {
    return {
      status: 'failed',
      error: { message: stderr || stdout || `i18n-translate exited ${code}` },
    };
  }

  return {
    status: 'ok',
    dryRun,
    preview: dryRun ? stdout : undefined,
    log: stdout || stderr,
    applied: !dryRun,
  };
}

export { getCorePackageRoot, getMonorepoRoot, RUNTIME_CACHE_ROOT };
