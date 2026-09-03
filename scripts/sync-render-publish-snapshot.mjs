#!/usr/bin/env node
/**
 * Sync Wave 0 publish/research pins on Render and trigger redeploy.
 *
 * Requires:
 *   RENDER_API_KEY=rnd_...
 *
 * Optional:
 *   RENDER_STAGING_SERVICE_ID / RENDER_PRODUCTION_SERVICE_ID
 *   RENDER_DASHBOARD_STAGING_SERVICE_ID
 *   WAVE0_SYNC_TARGETS=staging,production,dashboard-staging (default: staging,dashboard-staging)
 *
 * Usage:
 *   node scripts/sync-render-publish-snapshot.mjs
 *   node scripts/sync-render-publish-snapshot.mjs --dry-run
 */
const DRY = process.argv.includes('--dry-run');
const API = 'https://api.render.com/v1';
const KEY = process.env.RENDER_API_KEY || '';

const CORE_ENV = {
  PUBLISH_SNAPSHOT_V1: 'true',
  ENABLE_STORE_RESEARCH_PIPELINE: '1',
  ENABLE_GROUNDED_STORE_CREATION_V1: 'true',
  ENABLE_MISSION_001_STORE_FIDELITY_V1: '1',
  ENABLE_MISSION_001_OFFERING_RECONSTRUCTION_V1: '1',
  ENABLE_MISSION_001_GROUNDING_V1: '1',
  ENABLE_MISSION_001_FIDELITY_GATE_V1: '1',
};

const DASH_ENV = {
  VITE_PUBLISH_SNAPSHOT_V1: 'true',
};

const targetsWanted = String(process.env.WAVE0_SYNC_TARGETS || 'staging,dashboard-staging')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

async function api(path, init = {}) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* ignore */
  }
  if (!res.ok) {
    throw new Error(`${init.method || 'GET'} ${path} → ${res.status} ${text.slice(0, 300)}`);
  }
  return json;
}

async function listServices() {
  const out = [];
  let cursor = null;
  for (let i = 0; i < 20; i++) {
    const q = new URLSearchParams({ limit: '50' });
    if (cursor) q.set('cursor', cursor);
    const page = await api(`/services?${q}`);
    const rows = Array.isArray(page) ? page : page?.data || [];
    for (const row of rows) {
      const svc = row.service || row;
      out.push(svc);
    }
    cursor = page?.cursor || null;
    if (!cursor || rows.length === 0) break;
  }
  return out;
}

function resolveTargets(services) {
  const byName = Object.fromEntries(services.map((s) => [s.name, s]));
  const map = {
    staging: process.env.RENDER_STAGING_SERVICE_ID
      ? { id: process.env.RENDER_STAGING_SERVICE_ID, name: 'cardbey-core-staging', env: CORE_ENV }
      : byName['cardbey-core-staging']
        ? { id: byName['cardbey-core-staging'].id, name: 'cardbey-core-staging', env: CORE_ENV }
        : null,
    production: process.env.RENDER_PRODUCTION_SERVICE_ID
      ? { id: process.env.RENDER_PRODUCTION_SERVICE_ID, name: 'cardbey-core', env: CORE_ENV }
      : byName['cardbey-core']
        ? { id: byName['cardbey-core'].id, name: 'cardbey-core', env: CORE_ENV }
        : null,
    'dashboard-staging': process.env.RENDER_DASHBOARD_STAGING_SERVICE_ID
      ? {
          id: process.env.RENDER_DASHBOARD_STAGING_SERVICE_ID,
          name: 'cardbey-dashboard-staging',
          env: DASH_ENV,
        }
      : byName['cardbey-dashboard-staging']
        ? { id: byName['cardbey-dashboard-staging'].id, name: 'cardbey-dashboard-staging', env: DASH_ENV }
        : byName['cardbey-marketing-dashboard-staging']
          ? {
              id: byName['cardbey-marketing-dashboard-staging'].id,
              name: 'cardbey-marketing-dashboard-staging',
              env: DASH_ENV,
            }
          : null,
  };
  return targetsWanted.map((t) => ({ key: t, ...(map[t] || {}) })).filter((t) => t.id);
}

async function putEnv(serviceId, key, value) {
  if (DRY) {
    console.log(`[dry-run] PUT env ${serviceId} ${key}=${value}`);
    return;
  }
  await api(`/services/${serviceId}/env-vars/${encodeURIComponent(key)}`, {
    method: 'PUT',
    body: JSON.stringify({ value }),
  });
  console.log(`[ok] set ${key}`);
}

async function deploy(serviceId, name) {
  if (DRY) {
    console.log(`[dry-run] deploy ${name} (${serviceId})`);
    return null;
  }
  const dep = await api(`/services/${serviceId}/deploys`, {
    method: 'POST',
    body: JSON.stringify({ clearCache: 'do_not_clear' }),
  });
  const id = dep?.id || dep?.deploy?.id;
  console.log(`[ok] deploy started ${name} → ${id || JSON.stringify(dep).slice(0, 120)}`);
  return id;
}

async function waitDeploy(serviceId, deployId, timeoutMs = 12 * 60 * 1000) {
  if (DRY || !deployId) return true;
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const d = await api(`/services/${serviceId}/deploys/${deployId}`);
    const status = d?.status || d?.deploy?.status;
    console.log(`  deploy ${deployId} status=${status}`);
    if (status === 'live') return true;
    if (['build_failed', 'update_failed', 'canceled', 'deactivated'].includes(status)) {
      throw new Error(`deploy failed: ${status}`);
    }
    await new Promise((r) => setTimeout(r, 15000));
  }
  throw new Error('deploy wait timeout');
}

async function main() {
  if (!KEY) {
    console.error('Missing RENDER_API_KEY. Create one at https://dashboard.render.com/u/settings#api-keys');
    console.error('Then:  $env:RENDER_API_KEY="rnd_..."; node scripts/sync-render-publish-snapshot.mjs');
    process.exit(2);
  }
  console.log(`Sync Publish Snapshot pins (dry=${DRY}) targets=${targetsWanted.join(',')}`);
  const services = await listServices();
  console.log(`Found ${services.length} services`);
  const targets = resolveTargets(services);
  if (targets.length === 0) {
    console.error('No matching services. Known names:');
    for (const s of services) console.error(` - ${s.name} (${s.id})`);
    process.exit(1);
  }
  for (const t of targets) {
    console.log(`\n== ${t.key}: ${t.name} (${t.id}) ==`);
    for (const [k, v] of Object.entries(t.env)) {
      await putEnv(t.id, k, v);
    }
    const deployId = await deploy(t.id, t.name);
    await waitDeploy(t.id, deployId);
  }
  console.log('\nDone. Re-run: node scripts/wave1-store-creation-release-canary.mjs --hp-only');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
