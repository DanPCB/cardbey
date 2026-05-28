/**
 * Maintenance helpers for dashboard i18n auto-sync scripts.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

function getMonorepoRoot() {
  if (process.env.CARDBEY_MONOREPO_ROOT) {
    return path.resolve(process.env.CARDBEY_MONOREPO_ROOT);
  }
  return path.resolve(process.cwd(), '../../..');
}

export function getDashboardPackageRoot() {
  const root = getMonorepoRoot();
  const candidates = [
    path.join(root, 'apps/dashboard/cardbey-marketing-dashboard'),
    path.join(root, 'apps/cardbey-marketing-dashboard'),
  ];
  return candidates.find((p) => fs.existsSync(path.join(p, 'src/i18n.js'))) ?? candidates[0];
}

function runNodeScript(scriptName, extraArgs = []) {
  const dashboardRoot = getDashboardPackageRoot();
  const scriptPath = path.join(dashboardRoot, 'scripts', scriptName);

  return new Promise((resolve, reject) => {
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
    status: 'ok',
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
