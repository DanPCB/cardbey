#!/usr/bin/env node
/**
 * Seed a staging test store for P2/P5 validation.
 *
 * Usage (from apps/core/cardbey-core):
 *   STAGING_PASSWORD='...' node scripts/seed-staging-test-store.mjs
 *
 * Optional env:
 *   STAGING_BASE_URL   — default https://cardbey-core-staging.onrender.com
 *   STAGING_EMAIL      — default staging-p2p5-test@cardbey.local
 *   STAGING_PASSWORD   — required unless STAGING_TOKEN is set
 *   STAGING_TOKEN      — skip register/login if already authenticated
 *   STAGING_ADMIN_TOKEN — default dev-admin-token (agent lifecycle bootstrap)
 *   STAGING_STORE_NAME — default "Staging Test Store"
 */

const BASE = (process.env.STAGING_BASE_URL || 'https://cardbey-core-staging.onrender.com').replace(
  /\/$/,
  '',
);
const EMAIL = (process.env.STAGING_EMAIL || 'staging-p2p5-test@cardbey.local').trim();
const PASSWORD = process.env.STAGING_PASSWORD || '';
const STORE_NAME = (process.env.STAGING_STORE_NAME || 'Staging Test Store').trim();
const ADMIN_TOKEN = process.env.STAGING_ADMIN_TOKEN || 'dev-admin-token';

/** @type {string|null} */
let token = process.env.STAGING_TOKEN?.trim() || null;

async function request(path, { method = 'GET', body, authToken } = {}) {
  const headers = {
    ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
  };
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text.slice(0, 500) };
  }
  return { status: res.status, json, ok: res.ok };
}

async function ensureAuth() {
  if (token) return token;

  if (!PASSWORD) {
    throw new Error('Set STAGING_PASSWORD or STAGING_TOKEN');
  }

  const register = await request('/api/auth/register', {
    method: 'POST',
    body: { email: EMAIL, password: PASSWORD, displayName: 'Staging P2P5 Tester' },
  });

  if (register.status === 201 && register.json?.token) {
    token = register.json.token;
    console.log(`[seed] Registered ${EMAIL}`);
    return token;
  }

  const login = await request('/api/auth/login', {
    method: 'POST',
    body: { email: EMAIL, password: PASSWORD },
  });

  if (login.ok && login.json?.token) {
    token = login.json.token;
    console.log(`[seed] Logged in ${EMAIL}`);
    return token;
  }

  throw new Error(
    `Auth failed (register ${register.status}, login ${login.status}): ${
      login.json?.message || register.json?.message || 'unknown'
    }`,
  );
}

async function ensureStore(authToken) {
  const list = await request('/api/stores', { authToken });
  if (!list.ok) {
    throw new Error(`GET /api/stores failed: ${list.status}`);
  }

  const stores = Array.isArray(list.json?.stores) ? list.json.stores : [];
  const existing =
    stores.find((s) => s?.name === STORE_NAME) ||
    stores.find((s) => String(s?.name || '').toLowerCase().includes('staging test')) ||
    stores[0];

  if (existing?.id) {
    console.log(`[seed] Reusing store ${existing.id} (${existing.name})`);
    return { storeId: existing.id, userId: existing.userId, created: false };
  }

  const created = await request('/api/stores', {
    method: 'POST',
    authToken,
    body: { name: STORE_NAME, creationMethod: 'manual' },
  });

  if (!created.ok || !created.json?.store?.id) {
    throw new Error(
      `POST /api/stores failed: ${created.status} ${created.json?.message || created.json?.error || ''}`,
    );
  }

  const store = created.json.store;
  console.log(`[seed] Created store ${store.id} (${store.name})`);
  return { storeId: store.id, userId: store.userId, created: true };
}

async function bootstrapAgents() {
  const agentIds = ['analytics_agent', 'creative_agent', 'optimizer_agent'];
  for (const id of agentIds) {
    const res = await request(`/api/agents/${id}/start`, {
      method: 'POST',
      authToken: ADMIN_TOKEN,
    });
    if (!res.ok) {
      console.warn(`[seed] Agent start ${id} failed: ${res.status}`, res.json?.error || res.json?.message);
    } else {
      console.log(`[seed] Agent started: ${id}`);
    }
  }
}

async function main() {
  console.log(`[seed] Target: ${BASE}`);
  const authToken = await ensureAuth();
  const { storeId, userId, created } = await ensureStore(authToken);
  await bootstrapAgents();

  console.log('\n[seed] ✅ Staging fixture ready');
  console.log(`  STAGING_STORE_ID=${storeId}`);
  console.log(`  STAGING_USER_ID=${userId}`);
  console.log(`  STAGING_TOKEN=${authToken}`);
  console.log(`  storeCreated=${created}`);
}

main().catch((err) => {
  console.error('[seed] ❌', err?.message || err);
  process.exit(1);
});
