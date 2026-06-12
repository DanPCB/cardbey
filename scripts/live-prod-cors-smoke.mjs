#!/usr/bin/env node
/**
 * Live prod smoke: cardbey.com → cardbey-core CORS preflight + intake POST.
 * Run after deploy: node scripts/live-prod-cors-smoke.mjs
 */
const CORE_ORIGIN = process.env.CARDBEY_CORE_URL || 'https://cardbey-core.onrender.com';
const DASHBOARD_ORIGIN = process.env.CARDBEY_DASHBOARD_ORIGIN || 'https://cardbey.com';
const TIMEOUT_MS = 15000;

async function fetchTimeout(url, init) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  console.log(`🌐 Live prod CORS smoke\nCore: ${CORE_ORIGIN}\nDashboard origin: ${DASHBOARD_ORIGIN}\n`);

  const preflight = await fetchTimeout(`${CORE_ORIGIN}/api/performer/intake/v2`, {
    method: 'OPTIONS',
    headers: {
      Origin: DASHBOARD_ORIGIN,
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'content-type, authorization, x-session-id',
    },
  });

  if (preflight.status !== 204 && preflight.status !== 200) {
    console.error(`❌ OPTIONS preflight status ${preflight.status}`);
    process.exit(1);
  }

  const allowOrigin = preflight.headers.get('access-control-allow-origin');
  const allowHeaders = (preflight.headers.get('access-control-allow-headers') || '').toLowerCase();

  if (allowOrigin !== DASHBOARD_ORIGIN) {
    console.error(`❌ Access-Control-Allow-Origin: expected ${DASHBOARD_ORIGIN}, got ${allowOrigin}`);
    process.exit(1);
  }
  if (!allowHeaders.includes('x-session-id')) {
    console.error(`❌ Access-Control-Allow-Headers missing x-session-id: ${allowHeaders}`);
    process.exit(1);
  }
  console.log('✅ OPTIONS preflight OK (origin + x-session-id allowed)');

  const post = await fetchTimeout(`${CORE_ORIGIN}/api/performer/intake/v2`, {
    method: 'POST',
    headers: {
      Origin: DASHBOARD_ORIGIN,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      source: 'performer',
      locale: 'en',
      text: 'live cors smoke',
      goal: 'live cors smoke',
    }),
  });

  if (!post.ok) {
    const body = await post.text().catch(() => '');
    console.error(`❌ POST intake status ${post.status}: ${body.slice(0, 200)}`);
    process.exit(1);
  }

  const json = await post.json();
  if (!json?.success) {
    console.error(`❌ POST intake success=false: ${JSON.stringify(json).slice(0, 200)}`);
    process.exit(1);
  }
  console.log(`✅ POST intake OK (action=${json.action})`);
  console.log('\n✅ Live prod CORS smoke passed.');
}

main().catch((err) => {
  console.error('❌ Live prod CORS smoke failed:', err.message || err);
  process.exit(1);
});
