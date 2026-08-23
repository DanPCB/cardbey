#!/usr/bin/env node
/**
 * Guards Render deploy footguns that broke live (2026-06):
 * - server.js imports files missing from git
 * - workspace:* deps in npm-only Render builds (core + standalone dashboard)
 * - CORS allowlist drift between core and dashboard
 * - Performer intake re-sending X-Session-ID header (CORS preflight)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const coreRoot = path.join(repoRoot, 'apps/core/cardbey-core');
const dashboardRoot = path.join(repoRoot, 'apps/dashboard/cardbey-marketing-dashboard');

const failures = [];

function fail(msg) {
  failures.push(msg);
}

function read(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function parseJson(filePath) {
  return JSON.parse(read(filePath));
}

/** Relative ESM imports from server.js must exist on disk (Render npm ci has no monorepo workspace). */
function checkCoreServerImports() {
  const serverPath = path.join(coreRoot, 'src/server.js');
  const serverDir = path.dirname(serverPath);
  const src = read(serverPath);
  const importRe = /from\s+['"](\.\/[^'"]+)['"]/g;
  let match;
  while ((match = importRe.exec(src)) !== null) {
    const spec = match[1];
    const base = path.resolve(serverDir, spec);
    const candidates = [
      base,
      `${base}.js`,
      `${base}.mjs`,
      `${base}.ts`,
      path.join(base, 'index.js'),
      path.join(base, 'index.mjs'),
    ];
    if (!candidates.some((p) => fs.existsSync(p))) {
      fail(`Core server.js import missing: ${spec} (expected under src/)`);
    }
  }
}

function checkNoWorkspaceProtocol(packageJsonPath, label) {
  const pkg = parseJson(packageJsonPath);
  const deps = { ...pkg.dependencies, ...pkg.devDependencies, ...pkg.optionalDependencies };
  for (const [name, version] of Object.entries(deps)) {
    if (typeof version === 'string' && version.startsWith('workspace:')) {
      fail(`${label} must not use workspace: protocol for Render npm builds (${name}: ${version})`);
    }
  }
}

function extractCorsHeaderNames(filePath, pattern) {
  const src = read(filePath);
  const block = src.match(pattern);
  if (!block) return null;
  const names = [...block[0].matchAll(/'([^']+)'/g)].map((m) => m[1].toLowerCase());
  return new Set(names);
}

function checkCorsAllowlistSync() {
  const corePath = path.join(coreRoot, 'src/config/dashboardCorsHeaders.mjs');
  const dashPath = path.join(dashboardRoot, 'src/lib/corsHeadersAllowlist.ts');
  const coreHeaders = extractCorsHeaderNames(
    corePath,
    /export const DASHBOARD_CORS_REQUEST_HEADERS = \[[\s\S]*?\];/,
  );
  const dashHeaders = extractCorsHeaderNames(
    dashPath,
    /export const DASHBOARD_CORS_REQUEST_HEADERS = \[[\s\S]*?\] as const;/,
  );
  if (!coreHeaders || !dashHeaders) {
    fail('Could not parse CORS allowlist from core or dashboard');
    return;
  }
  for (const h of coreHeaders) {
    if (!dashHeaders.has(h)) {
      fail(`CORS allowlist drift: core has "${h}" missing from dashboard corsHeadersAllowlist.ts`);
    }
  }
  for (const h of dashHeaders) {
    if (!coreHeaders.has(h)) {
      fail(`CORS allowlist drift: dashboard has "${h}" missing from core dashboardCorsHeaders.mjs`);
    }
  }
  const required = ['x-session-id', 'content-type', 'authorization'];
  for (const h of required) {
    if (!coreHeaders.has(h)) {
      fail(`CORS allowlist missing required header: ${h}`);
    }
  }
}

function checkIntakeNoSessionHeader() {
  const intakePath = path.join(dashboardRoot, 'src/app/console/performer/useIntakeV2.ts');
  const src = read(intakePath);
  if (/'X-Session-ID':\s*conversationSessionId/.test(src)) {
    fail('useIntakeV2 must not send X-Session-ID header (session belongs in JSON body; triggers CORS preflight)');
  }
}

function checkMigrationHealthCheckTracked() {
  const mod = path.join(coreRoot, 'src/lib/migrationHealthCheck.js');
  if (!fs.existsSync(mod)) {
    fail('migrationHealthCheck.js missing — server.js imports it at boot');
  }
}

/**
 * Dashboard static services: Architecture A (parent monorepo) + relative submodule URL.
 * Absolute HTTPS submodule URLs break Render auto-clone; Architecture B is blocked until
 * service Git Credentials can clone the private dashboard as primary.
 */
function checkDashboardServicesAvoidUnauthSubmodule() {
  const renderPath = path.join(repoRoot, 'render.yaml');
  if (!fs.existsSync(renderPath)) {
    fail('render.yaml missing at monorepo root');
    return;
  }
  const yaml = read(renderPath).replace(/\r\n/g, '\n');
  const gitmodulesPath = path.join(repoRoot, '.gitmodules');
  if (!fs.existsSync(gitmodulesPath)) {
    fail('.gitmodules missing');
    return;
  }
  const gitmodules = read(gitmodulesPath).replace(/\r\n/g, '\n');
  if (/url\s*=\s*https:\/\/github\.com\/DanPCB\/cardbey-marketing-dashboard/.test(gitmodules)) {
    fail(
      '.gitmodules must use relative url ../cardbey-marketing-dashboard.git (absolute HTTPS breaks Render private submodule auto-clone)',
    );
  }
  if (!/url\s*=\s*\.\.\/cardbey-marketing-dashboard\.git/.test(gitmodules)) {
    fail('.gitmodules dashboard submodule url must be ../cardbey-marketing-dashboard.git');
  }

  for (const name of ['cardbey-dashboard-staging', 'cardbey-dashboard']) {
    const marker = `\n    name: ${name}\n`;
    const nameIdx = yaml.indexOf(marker);
    if (nameIdx < 0) {
      fail(`render.yaml missing service ${name}`);
      continue;
    }
    const after = yaml.slice(nameIdx + 1);
    const next = after.search(/\n  - type:/);
    const block = next >= 0 ? after.slice(0, next) : after;

    if (/repo:\s*https:\/\/github\.com\/DanPCB\/cardbey-marketing-dashboard/.test(block)) {
      fail(
        `render.yaml ${name} must use primary repo DanPCB/cardbey until service Git Credentials can clone the private dashboard`,
      );
    }
    if (!/repo:\s*https:\/\/github\.com\/DanPCB\/cardbey\b/.test(block)) {
      fail(`render.yaml ${name} must set repo to https://github.com/DanPCB/cardbey`);
    }
    if (!/render-dashboard-static-build\.mjs/.test(block)) {
      fail(`render.yaml ${name} must use node scripts/render-dashboard-static-build.mjs`);
    }
    if (!/staticPublishPath:\s*apps\/dashboard\/cardbey-marketing-dashboard\/dist/.test(block)) {
      fail(
        `render.yaml ${name} must use staticPublishPath: apps/dashboard/cardbey-marketing-dashboard/dist`,
      );
    }
  }
}

function dashboardReady() {
  return fs.existsSync(path.join(dashboardRoot, 'package.json'));
}

function main() {
  console.log('🔍 Render deploy readiness\n');
  checkCoreServerImports();
  checkNoWorkspaceProtocol(path.join(coreRoot, 'package.json'), 'Core package.json');
  if (dashboardReady()) {
    checkNoWorkspaceProtocol(path.join(dashboardRoot, 'package.json'), 'Dashboard package.json');
    checkCorsAllowlistSync();
    checkIntakeNoSessionHeader();
  } else {
    console.log(
      '⚠️  Dashboard submodule not checked out — skipping dashboard-specific deploy checks (expected in CI without private submodule access).',
    );
  }
  checkMigrationHealthCheckTracked();
  checkDashboardServicesAvoidUnauthSubmodule();

  if (failures.length) {
    console.error('❌ Deploy readiness FAILED:\n');
    for (const f of failures) console.error(`  • ${f}`);
    process.exit(1);
  }
  console.log('✅ Render deploy readiness passed.');
}

main();
