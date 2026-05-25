#!/usr/bin/env node
/**
 * Runtime smoke: Core API + Dashboard reachability, critical routes, SSE policy.
 * Requires live servers unless --offline (checks constants only).
 *
 * Usage:
 *   node scripts/regression-smoke.mjs           # probe live (fail if down)
 *   node scripts/regression-smoke.mjs --offline # skip HTTP (CI uses contract tests instead)
 */
import {
  CORE_HEALTH_URL,
  CORE_PORT,
  DASHBOARD_PORT,
  DASHBOARD_URL,
} from './dev-constants.mjs';

const API_BASE = process.env.API_BASE || process.env.CARDBEY_API_BASE || `http://127.0.0.1:${CORE_PORT}`;
const DASHBOARD_BASE = process.env.DASHBOARD_BASE || `http://127.0.0.1:${DASHBOARD_PORT}`;
const OFFLINE = process.argv.includes('--offline');
const TIMEOUT_MS = Number(process.env.SMOKE_TIMEOUT_MS || 8000);

async function fetchWithTimeout(url, init = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function probe(name, url, expect) {
  try {
    const res = await fetchWithTimeout(url, expect?.init);
    const ok = expect?.ok ? expect.ok(res) : res.ok;
    if (ok) {
      console.log(`✅ ${name.padEnd(28)} ${res.status}`);
      return true;
    }
    const body = await res.text().catch(() => '');
    console.log(`❌ ${name.padEnd(28)} ${res.status} ${body.slice(0, 120)}`);
    return false;
  } catch (err) {
    console.log(`❌ ${name.padEnd(28)} ${err.message}`);
    return false;
  }
}

async function probeSse(name, url) {
  try {
    const res = await fetchWithTimeout(url);
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('text/event-stream')) {
      console.log(`✅ ${name.padEnd(28)} SSE`);
      res.body?.cancel?.();
      return true;
    }
    console.log(`❌ ${name.padEnd(28)} not SSE (${ct})`);
    return false;
  } catch (err) {
    console.log(`❌ ${name.padEnd(28)} ${err.message}`);
    return false;
  }
}

async function runLive() {
  console.log('🧪 Cardbey regression smoke (live)\n');
  console.log(`Core:      ${API_BASE}`);
  console.log(`Dashboard: ${DASHBOARD_BASE}\n`);

  let passed = 0;
  let failed = 0;

  const httpChecks = [
    ['Core /api/health', `${API_BASE}/api/health`, async (res) => {
      if (!res.ok) return false;
      const j = await res.json();
      return j?.ok === true;
    }],
    ['Journey templates', `${API_BASE}/api/journeys/templates`, async (res) => {
      if (!res.ok) return false;
      const j = await res.json();
      return Array.isArray(j?.templates);
    }],
    ['Core /api/ping', `${API_BASE}/api/ping`, async (res) => res.ok],
    ['Dashboard root', `${DASHBOARD_BASE}/`, async (res) => res.ok || res.status === 304],
  ];

  for (const [name, url, okFn] of httpChecks) {
    const ok = await probe(name, url, { ok: okFn });
    if (ok) passed++;
    else failed++;
  }

  for (const [name, path] of [
    ['SSE /api/stream', `${API_BASE}/api/stream`],
    ['SSE /api/ai/stream', `${API_BASE}/api/ai/stream`],
  ]) {
    const ok = await probeSse(name, path);
    if (ok) passed++;
    else failed++;
  }

  // Dev-only debug route (200 or 503 if DB down — must not 404)
  const debugOk = await probe(
    'Debug store-creation-health',
    `${API_BASE}/api/debug/store-creation-health?limit=1`,
    {
      ok: (res) => res.status !== 404 && res.status !== 405,
    },
  );
  if (debugOk) passed++;
  else failed++;

  console.log('\n' + '='.repeat(50));
  console.log(`Passed: ${passed}  Failed: ${failed}`);
  if (failed > 0) {
    console.log('\nStart servers: pnpm dev:core & pnpm dev:dashboard');
    console.log(`Then: GET ${CORE_HEALTH_URL}`);
    process.exit(1);
  }
  console.log('✅ Live smoke passed.');
}

function runOffline() {
  console.log('🧪 Cardbey regression smoke (offline)\n');
  console.log('Skipping HTTP probes. Run contract tests: pnpm regression:contracts');
  console.log(`Expected Core health URL: ${CORE_HEALTH_URL}`);
  console.log(`Expected Dashboard URL:  ${DASHBOARD_URL}`);
  console.log('\n✅ Offline smoke OK (no live servers required).');
}

if (OFFLINE) {
  runOffline();
} else {
  runLive().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
