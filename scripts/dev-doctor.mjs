#!/usr/bin/env node
/**
 * Cardbey local dev environment doctor.
 * Read-only diagnostics — never prints secret values.
 *
 * Usage:
 *   node scripts/dev-doctor.mjs
 *   node scripts/dev-doctor.mjs --probe   (also GET /api/health)
 *   node scripts/dev-doctor.mjs --strict  (exit 1 on any issue)
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  REPO_ROOT,
  CORE_PORT,
  DASHBOARD_PORT,
  CORE_DIR,
  DASHBOARD_DIR,
  SQLITE_SCHEMA,
  PRISMA_CLIENT_GEN,
  CORE_HEALTH_URL,
  DASHBOARD_URL,
  CORE_ENV_KEYS,
  DASHBOARD_ENV_KEYS,
} from './dev-constants.mjs';
import {
  getPortListeners,
  getProcessCommandLine,
  findCoreDevProcesses,
  findDashboardDevProcesses,
  loadEnvFile,
  maskDatabaseUrl,
  assessPrismaLockRisk,
} from './dev-process-utils.mjs';

const probe = process.argv.includes('--probe');
const strict = process.argv.includes('--strict');

/** @type {{ level: 'ok'|'warn'|'fail', msg: string }[]} */
const issues = [];

function ok(msg) {
  console.log(`✅ ${msg}`);
}
function warn(msg) {
  console.log(`⚠️  ${msg}`);
  issues.push({ level: 'warn', msg });
}
function fail(msg) {
  console.log(`❌ ${msg}`);
  issues.push({ level: 'fail', msg });
}

function reportPort(port, label) {
  const listeners = getPortListeners(port).filter((l) => l.state === 'Listen' || l.state === '');
  const uniquePids = [...new Set(listeners.map((l) => l.pid))].filter((p) => p > 0);

  if (uniquePids.length === 0) {
    ok(`${label} port ${port}: free`);
    return;
  }

  if (uniquePids.length === 1) {
    const cmd = getProcessCommandLine(uniquePids[0]);
    ok(`${label} port ${port}: in use by PID ${uniquePids[0]} (${cmd.slice(0, 80) || 'unknown'})`);
    return;
  }

  fail(`${label} port ${port}: multiple listeners (${uniquePids.join(', ')})`);
}

function reportEnvKeys(env, keys, label) {
  console.log(`\n${label} env (presence only):`);
  for (const key of keys) {
    const val = env[key] ?? process.env[key];
    if (val == null || val === '') {
      warn(`  ${key}: not set`);
    } else if (key === 'DATABASE_URL') {
      ok(`  ${key}: ${maskDatabaseUrl(val)}`);
    } else if (/secret|key|token|password/i.test(key)) {
      ok(`  ${key}: (set, redacted)`);
    } else {
      ok(`  ${key}: (set)`);
    }
  }
}

console.log('🩺 Cardbey dev doctor\n');
console.log(`Repo: ${REPO_ROOT}`);
console.log(`Canonical ports: Core ${CORE_PORT}, Dashboard ${DASHBOARD_PORT}`);
console.log(`SQLite schema: ${SQLITE_SCHEMA}\n`);

// --- Ports ---
console.log('--- Ports ---');
reportPort(CORE_PORT, 'Core API');
reportPort(DASHBOARD_PORT, 'Dashboard');

// --- Processes ---
console.log('\n--- Cardbey dev processes ---');
const coreProcs = findCoreDevProcesses();
const dashProcs = findDashboardDevProcesses();

const coreApi = coreProcs.filter((p) =>
  ['dev-api-entry', 'with-role-dev-api', 'nodemon', 'server'].includes(p.kind),
);

if (coreApi.length === 0) {
  ok('Core dev-api processes: none');
} else if (coreApi.length === 1) {
  ok(`Core dev-api processes: 1 (PID ${coreApi[0].pid} ${coreApi[0].kind})`);
} else {
  fail(`Core dev-api processes: ${coreApi.length} (expected 0 or 1)`);
  for (const p of coreApi) {
    console.log(`     PID ${p.pid} [${p.kind}]`);
  }
}

const stale = coreProcs.filter((p) => p.kind === 'test-auth-local');
if (stale.length > 0) {
  warn(`Stale test-auth-local.mjs: ${stale.length} process(es) — consider pnpm dev:cleanup`);
}

if (dashProcs.length === 0) {
  ok('Dashboard Vite processes: none');
} else if (dashProcs.length === 1) {
  ok(`Dashboard Vite processes: 1 (PID ${dashProcs[0].pid})`);
} else {
  fail(`Dashboard Vite processes: ${dashProcs.length} (expected 0 or 1)`);
}

// --- DATABASE_URL ---
console.log('\n--- Database target ---');
const coreEnvPath = path.join(CORE_DIR, '.env');
const coreEnv = { ...loadEnvFile(coreEnvPath), ...process.env };
const dbUrl = coreEnv.DATABASE_URL;
if (!dbUrl) {
  fail('DATABASE_URL not set in apps/core/cardbey-core/.env');
} else {
  ok(`DATABASE_URL → ${maskDatabaseUrl(dbUrl)}`);
  if (dbUrl.includes('test.db') && coreEnv.NODE_ENV !== 'test') {
    warn('DATABASE_URL points at test.db while NODE_ENV is not test');
  }
}

if (!fs.existsSync(SQLITE_SCHEMA)) {
  fail(`SQLite schema missing: ${SQLITE_SCHEMA}`);
} else {
  ok('SQLite schema file exists');
}

// --- Prisma lock ---
console.log('\n--- Prisma client-gen ---');
const lock = assessPrismaLockRisk(PRISMA_CLIENT_GEN);
if (lock.locked) {
  warn(`Prisma generate lock risk: ${lock.detail}`);
  console.log('   Fix: pnpm dev:cleanup  then  pnpm dev:prisma');
} else {
  ok(`Prisma client-gen: ${lock.detail}`);
}

// --- Env ---
reportEnvKeys(coreEnv, CORE_ENV_KEYS, 'Core');
const dashEnvPath = path.join(DASHBOARD_DIR, '.env');
const dashEnv = { ...loadEnvFile(dashEnvPath), ...process.env };
reportEnvKeys(dashEnv, DASHBOARD_ENV_KEYS, 'Dashboard');

// --- HTTP probe ---
if (probe) {
  console.log('\n--- HTTP probe ---');
  const coreListening = getPortListeners(CORE_PORT).length > 0;
  const dashListening = getPortListeners(DASHBOARD_PORT).length > 0;

  try {
    const res = await fetch(CORE_HEALTH_URL, { signal: AbortSignal.timeout(5000) });
    if (res.ok) {
      ok(`GET ${CORE_HEALTH_URL} → ${res.status}`);
    } else if (!coreListening) {
      warn(`GET ${CORE_HEALTH_URL} → ${res.status} (Core not listening — run pnpm dev:core)`);
    } else {
      fail(`GET ${CORE_HEALTH_URL} → ${res.status}`);
    }
  } catch (e) {
    if (!coreListening) {
      warn(`Core not running — start: pnpm dev:core`);
    } else {
      fail(`GET ${CORE_HEALTH_URL} → ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  try {
    const res = await fetch(DASHBOARD_URL, { signal: AbortSignal.timeout(5000) });
    if (res.ok) {
      ok(`GET ${DASHBOARD_URL} → ${res.status}`);
    } else if (!dashListening) {
      warn(`GET ${DASHBOARD_URL} → ${res.status} (Dashboard not listening — run pnpm dev:dashboard)`);
    } else {
      warn(`GET ${DASHBOARD_URL} → ${res.status}`);
    }
  } catch (e) {
    if (!dashListening) {
      warn(`Dashboard not running — start: pnpm dev:dashboard`);
    } else {
      warn(`Dashboard not reachable: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}

// --- Summary ---
console.log('\n--- Summary ---');
const fails = issues.filter((i) => i.level === 'fail');
const warns = issues.filter((i) => i.level === 'warn');

if (fails.length === 0 && warns.length === 0) {
  console.log('✅ Dev environment looks healthy.');
  console.log('\nStart (two terminals):');
  console.log('  Terminal 1: pnpm dev:core');
  console.log('  Terminal 2: pnpm dev:dashboard');
  console.log(`\n  Core:      http://127.0.0.1:${CORE_PORT}/api/health`);
  console.log(`  Dashboard: http://127.0.0.1:${DASHBOARD_PORT}/`);
  process.exit(0);
}

if (fails.length > 0) {
  console.log(`❌ ${fails.length} issue(s) must be fixed before reliable local dev.`);
}
if (warns.length > 0) {
  console.log(`⚠️  ${warns.length} warning(s). Run pnpm dev:cleanup if processes are stale.`);
}

console.log('\nCommands (repo root or from apps/core|dashboard packages):');
console.log('  pnpm dev:doctor --probe');
console.log('  pnpm dev:cleanup -- --force');
console.log('  pnpm dev:prisma');
console.log('  pnpm dev:core       # or: cd apps/core/cardbey-core && pnpm dev');
console.log('  pnpm dev:dashboard  # or: cd apps/dashboard/... && pnpm dev');

process.exit(strict && (fails.length > 0 || warns.length > 0) ? 1 : fails.length > 0 ? 1 : 0);
