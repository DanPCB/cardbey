#!/usr/bin/env node
/**
 * CI gate: no new i18n hardcoded-string debt vs the audited baseline.
 * Does not claim the remaining debt is resolved. Never auto-raises the cap.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  loadAndValidateBaseline,
  evaluateI18nNoNewDebt,
  formatI18nDebtReport,
} from './i18nNoNewDebt.mjs';

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const baselinePath = path.join(repoRoot, 'scripts/i18n-debt-baseline.json');
const dashboardRoot = path.join(repoRoot, 'apps/dashboard/cardbey-marketing-dashboard');
const artifactDir = path.join(repoRoot, 'artifacts/i18n');

function git(args, cwd) {
  const res = spawnSync('git', args, { cwd, encoding: 'utf8', windowsHide: true });
  if (res.status !== 0) return '';
  return (res.stdout || '').trim();
}

function changedSrcFiles(dashboardSha, sourceSha) {
  if (!dashboardSha || !sourceSha || dashboardSha.toLowerCase() === sourceSha.toLowerCase()) {
    return [];
  }
  const out = git(['diff', '--name-only', `${sourceSha}...${dashboardSha}`, '--', 'src'], dashboardRoot);
  return out
    .split(/\r?\n/)
    .map((l) => l.trim().replace(/\\/g, '/'))
    .filter((l) => l.startsWith('src/') && /\.(ts|tsx)$/.test(l))
    .map((l) => l.slice('src/'.length));
}

if (!fs.existsSync(baselinePath)) {
  console.error('[i18n-no-new-debt] BASELINE_MISSING', baselinePath);
  process.exit(1);
}

let parsed;
try {
  parsed = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
} catch {
  console.error('[i18n-no-new-debt] BASELINE_CORRUPT JSON');
  process.exit(1);
}

const loaded = loadAndValidateBaseline(parsed);
if (!loaded.ok) {
  console.error('[i18n-no-new-debt]', loaded.code, loaded.message);
  process.exit(1);
}

const i18nLib = await import(pathToFileURL(path.join(dashboardRoot, 'scripts/i18n-lib.mjs')).href);
const gaps = i18nLib.scanHardcodedGaps();
const fileCounts = {};
for (const g of gaps) {
  fileCounts[g.file] = (fileCounts[g.file] || 0) + 1;
}

const dashboardSha = git(['rev-parse', 'HEAD'], dashboardRoot) || null;
const changedFiles = changedSrcFiles(dashboardSha, loaded.baseline.sourceDashboardSha);

const result = evaluateI18nNoNewDebt({
  count: gaps.length,
  fileCounts,
  changedFiles,
  dashboardSha,
  baseline: loaded.baseline,
});

const report = {
  scannedAt: new Date().toISOString(),
  count: gaps.length,
  fileCount: Object.keys(fileCounts).length,
  items: gaps,
  gate: result,
};

fs.mkdirSync(artifactDir, { recursive: true });
fs.writeFileSync(path.join(artifactDir, 'i18n-gaps.json'), `${JSON.stringify(report, null, 2)}\n`);
fs.writeFileSync(path.join(artifactDir, 'i18n-debt-summary.md'), formatI18nDebtReport(result));

const summary = formatI18nDebtReport(result);
process.stdout.write(summary);
if (process.env.GITHUB_STEP_SUMMARY) {
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
}

if (result.verdict !== 'pass') {
  console.error(
    `[i18n-no-new-debt] FAIL ${result.reason}: ${result.count} vs audited ${result.auditedBaseline} (historical target ${result.historicalTarget})`,
  );
  process.exit(1);
}

console.log(
  `[i18n-no-new-debt] PASS ${result.reason}: ${result.count} vs audited ${result.auditedBaseline}; historical target ${result.historicalTarget} still unpaid`,
);
process.exit(0);
