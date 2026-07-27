#!/usr/bin/env node
/**
 * Staging Store Validation — P2 skills + P5 agents with a real storeId.
 *
 * Usage:
 *   STAGING_PASSWORD='...' node scripts/validate-staging-store.mjs
 *
 * Or after seeding:
 *   STAGING_TOKEN='...' STAGING_STORE_ID='...' STAGING_USER_ID='...' node scripts/validate-staging-store.mjs
 *
 * Optional env:
 *   STAGING_BASE_URL, STAGING_EMAIL, STAGING_PASSWORD, STAGING_TOKEN
 *   STAGING_STORE_ID, STAGING_USER_ID
 *   STAGING_ADMIN_TOKEN (agent bootstrap; default dev-admin-token)
 */

const BASE = (process.env.STAGING_BASE_URL || 'https://cardbey-core-staging.onrender.com').replace(
  /\/$/,
  '',
);
const EMAIL = (process.env.STAGING_EMAIL || 'staging-p2p5-test@cardbey.local').trim();
const PASSWORD = process.env.STAGING_PASSWORD || '';
const ADMIN_TOKEN = process.env.STAGING_ADMIN_TOKEN || 'dev-admin-token';

/** @type {Array<{ name: string; ok: boolean; detail?: string }>} */
const results = [];

function pass(name, detail) {
  results.push({ name, ok: true, detail });
  console.log(`  ✅ ${name}${detail ? ` — ${detail}` : ''}`);
}

function fail(name, detail) {
  results.push({ name, ok: false, detail });
  console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`);
}

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
  if (process.env.STAGING_TOKEN?.trim()) {
    return process.env.STAGING_TOKEN.trim();
  }
  if (!PASSWORD) {
    throw new Error('Set STAGING_PASSWORD or STAGING_TOKEN');
  }
  const login = await request('/api/auth/login', {
    method: 'POST',
    body: { email: EMAIL, password: PASSWORD },
  });
  if (!login.ok || !login.json?.token) {
    throw new Error(`Login failed (${login.status}): ${login.json?.message || 'no token'}`);
  }
  return login.json.token;
}

async function bootstrapAgents() {
  for (const id of ['analytics_agent', 'creative_agent', 'optimizer_agent']) {
    await request(`/api/agents/${id}/start`, { method: 'POST', authToken: ADMIN_TOKEN });
  }
}

async function resolveFixture(authToken) {
  let storeId = process.env.STAGING_STORE_ID?.trim() || '';
  let userId = process.env.STAGING_USER_ID?.trim() || '';

  const list = await request('/api/stores', { authToken });
  if (!list.ok) {
    throw new Error(`GET /api/stores failed: ${list.status}`);
  }

  const stores = Array.isArray(list.json?.stores) ? list.json.stores : [];
  if (!storeId && stores[0]?.id) {
    storeId = stores[0].id;
    userId = stores[0].userId;
  }

  if (!storeId) {
    throw new Error('No store found. Run: node scripts/seed-staging-test-store.mjs');
  }

  if (!userId) {
    const me = await request('/api/auth/me', { authToken });
    userId = me.json?.user?.id || me.json?.id || '';
  }

  return { storeId, userId };
}

async function main() {
  console.log('🚀 Validating staging store (P2/P5)...\n');
  console.log(`Target: ${BASE}\n`);

  const authToken = await ensureAuth();
  const { storeId, userId } = await resolveFixture(authToken);

  console.log(`Store: ${storeId}`);
  console.log(`User:  ${userId}\n`);

  // 1. Store list
  const stores = await request('/api/stores', { authToken });
  const found = (stores.json?.stores || []).some((s) => s.id === storeId);
  if (found) pass('Store in GET /api/stores', storeId);
  else fail('Store in GET /api/stores', 'storeId not in list');

  const storeDetail = await request(`/api/stores/${storeId}`, { authToken });
  if (storeDetail.ok) pass('Store detail', `HTTP ${storeDetail.status}`);
  else fail('Store detail', `HTTP ${storeDetail.status}`);

  // 2. Skills list
  const skills = await request('/api/skills/list', { authToken });
  const skillCount = Array.isArray(skills.json?.skills) ? skills.json.skills.length : 0;
  if (skills.ok && skillCount > 0) pass('Skill list', `${skillCount} skills`);
  else fail('Skill list', `HTTP ${skills.status}`);

  // 3. Skill execute
  const skillExec = await request('/api/skills/execute', {
    method: 'POST',
    authToken,
    body: {
      skillId: 'analyze_store',
      context: { storeId, userId },
    },
  });
  if (skillExec.ok && skillExec.json?.ok) pass('Skill execute (analyze_store)');
  else fail('Skill execute', skillExec.json?.error || `HTTP ${skillExec.status}`);

  // 4. Skill compose
  const skillCompose = await request('/api/skills/compose', {
    method: 'POST',
    authToken,
    body: {
      mode: 'sequence',
      skills: [{ id: 'analyze_store' }, { id: 'generate_content' }],
      context: { storeId, userId, topic: 'staging validation' },
    },
  });
  if (skillCompose.ok && skillCompose.json?.ok) pass('Skill compose (sequence)');
  else fail('Skill compose', skillCompose.json?.error || `HTTP ${skillCompose.status}`);

  // 5. Agents list
  const agents = await request('/api/agents', { authToken: ADMIN_TOKEN });
  const agentCount = Array.isArray(agents.json?.agents) ? agents.json.agents.length : 0;
  if (agents.ok && agentCount > 0) pass('Agent list', `${agentCount} agents`);
  else fail('Agent list', `HTTP ${agents.status}`);

  // 6. Agent health bootstrap + execute
  await bootstrapAgents();

  const agentExec = await request('/api/agents/analytics_agent/execute', {
    method: 'POST',
    authToken,
    body: { context: { storeId, userId } },
  });
  if (agentExec.ok && agentExec.json?.ok) pass('Agent execute (analytics_agent)');
  else fail('Agent execute', agentExec.json?.error || `HTTP ${agentExec.status}`);

  const parallel = await request('/api/agents/parallel', {
    method: 'POST',
    authToken,
    body: {
      agents: [{ id: 'analytics_agent' }, { id: 'creative_agent' }],
      context: { storeId, userId, topic: 'staging validation' },
    },
  });
  const fulfilled =
    parallel.json?.result?.successCount ??
    (parallel.json?.result?.results || []).filter((r) => r.status === 'fulfilled').length;
  if (parallel.ok && fulfilled > 0) pass('Agent parallel', `${fulfilled} fulfilled`);
  else fail('Agent parallel', parallel.json?.error || `successCount=${fulfilled}`);

  const chain = await request('/api/agents/chain', {
    method: 'POST',
    authToken,
    body: {
      agents: [{ id: 'analytics_agent' }, { id: 'optimizer_agent' }],
      context: { storeId, userId },
    },
  });
  if (chain.ok && chain.json?.ok) pass('Agent chain');
  else fail('Agent chain', chain.json?.error || `HTTP ${chain.status}`);

  const allOk = results.every((r) => r.ok);
  console.log('\n📊 Summary');
  console.log(`   Store ID: ${storeId}`);
  console.log(`   Checks: ${results.filter((r) => r.ok).length}/${results.length} passed`);
  console.log(`\n${allOk ? '✅ All validations PASSED' : '❌ Some validations FAILED'}`);
  process.exit(allOk ? 0 : 1);
}

main().catch((err) => {
  console.error('❌ Validation error:', err?.message || err);
  process.exit(1);
});
