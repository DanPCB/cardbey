/**
 * Phase F bypass audit — telemetry baseline + flag snapshot.
 *
 * Usage (from apps/core/cardbey-core):
 *   node scripts/phase-f-bypass-audit.mjs
 *
 * Optional env:
 *   API_BASE=http://localhost:3001
 */

import { config as loadEnv } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
loadEnv({ path: resolve(root, '../../..', '.env') });
loadEnv({ path: resolve(root, '.env'), override: true });

const API_BASE = (process.env.API_BASE || 'http://localhost:3001').replace(/\/$/, '');

function ok(name, detail) {
  console.log(`[phase-f-audit] ✅ ${name}`, detail ?? '');
}
function fail(name, detail) {
  console.log(`[phase-f-audit] ❌ ${name}`, detail ?? '');
}
function warn(name, detail) {
  console.log(`[phase-f-audit] ⚠️  ${name}`, detail ?? '');
}

async function jfetch(path) {
  const res = await fetch(`${API_BASE}${path}`);
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  return { status: res.status, json };
}

async function main() {
  console.log('[phase-f-audit] API_BASE=', API_BASE);

  const snap = await jfetch('/api/broker/phase-f-bypass');
  if (snap.status !== 200 || !snap.json?.ok) {
    fail('phase-f-bypass snapshot', { status: snap.status, body: snap.json });
    process.exit(1);
  }
  ok('phase-f-bypass snapshot', {
    telemetryEnabled: snap.json.telemetryEnabled,
    flags: snap.json.flags,
    metrics: snap.json.metrics,
  });

  const authority = await jfetch('/api/broker/runtime-authority');
  if (authority.status === 200 && authority.json?.ok) {
    ok('runtime-authority snapshot', {
      rolloutStage: authority.json.rolloutStage,
      metrics: authority.json.metrics,
    });
  } else {
    warn('runtime-authority unavailable', { status: authority.status });
  }

  const blockFlags = snap.json.flags ?? {};
  const anyBlockEnabled = Object.values(blockFlags).some((v) => v === true);
  if (anyBlockEnabled) {
    warn('closure flags enabled — verify staging soak before production', blockFlags);
  } else {
    ok('measurement mode — all Phase F block flags OFF');
  }

  const metrics = snap.json.metrics ?? {};
  const totalHits = Object.values(metrics).reduce((a, b) => a + (typeof b === 'number' ? b : 0), 0);
  if (totalHits === 0) {
    ok('zero bypass hits in-process (baseline clean or server just started)');
  } else {
    warn('bypass hits recorded', metrics);
  }

  console.log('[phase-f-audit] PASS');
}

main().catch((err) => {
  console.error('[phase-f-audit] FATAL', err);
  process.exit(1);
});
