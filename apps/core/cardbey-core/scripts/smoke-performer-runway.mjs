#!/usr/bin/env node
/**
 * Live smoke tests for Performer Runway against a running cardbey-core instance.
 * Usage: node scripts/smoke-performer-runway.mjs [--base=http://localhost:3001]
 */
const BASE = (process.argv.find((a) => a.startsWith('--base='))?.slice(7) || 'http://localhost:3001').replace(
  /\/$/,
  '',
);
const AUTH = 'Bearer dev-admin-token';

function log(label, data) {
  console.log(`\n=== ${label} ===`);
  if (data !== undefined) console.log(typeof data === 'string' ? data : JSON.stringify(data, null, 2));
}

async function request(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: AUTH,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: body != null ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { _raw: text.slice(0, 500) };
  }
  return { status: res.status, ok: res.ok, json };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  const results = [];
  const pass = (name) => {
    results.push({ name, ok: true });
    console.log(`✅ ${name}`);
  };
  const fail = (name, err) => {
    results.push({ name, ok: false, error: String(err?.message ?? err) });
    console.log(`❌ ${name}: ${err?.message ?? err}`);
  };

  log('Config', { BASE, auth: 'dev-admin-token' });

  // Health
  try {
    const health = await request('GET', '/api/health');
    assert(health.status === 200 && health.json?.ok === true, `health ${health.status}`);
    pass('Core health');
  } catch (e) {
    fail('Core health', e);
    process.exit(1);
  }

  // Store creation intake
  try {
    const store = await request('POST', '/api/performer/intake/v2', {
      text: 'create a store for Smoke Test Cafe',
      currentContext: {},
      history: [],
      parameters: {
        storeName: 'Smoke Test Cafe',
        businessName: 'Smoke Test Cafe',
        businessType: 'Food & drink',
        location: 'Melbourne',
      },
    });
    log('Store intake response', { status: store.status, body: store.json });
    assert(store.status === 200, `expected 200 got ${store.status}`);
    const action = store.json?.action;
    const okActions = ['store_mission_started', 'create_store', 'approval_required', 'clarify'];
    assert(
      okActions.includes(action) || store.json?.success === true,
      `unexpected action: ${action}`,
    );
    if (store.json?.missionId || store.json?.storeMissionSummary?.missionId) {
      pass(`Store creation intake (mission: ${store.json?.missionId ?? store.json?.storeMissionSummary?.missionId})`);
    } else {
      pass(`Store creation intake (action: ${action})`);
    }
  } catch (e) {
    fail('Store creation intake', e);
  }

  // Video creation intake (plan or clarify — full generation may need confirmation)
  try {
    const video = await request('POST', '/api/performer/intake/v2', {
      text: 'Create a promotional video for my store',
      currentContext: {},
      history: [],
    });
    log('Video intake response', { status: video.status, body: video.json });
    assert(video.status === 200, `expected 200 got ${video.status}`);
    const tool =
      video.json?.tool ??
      video.json?.classification?.tool ??
      video.json?.action ??
      video.json?.recommendedTool;
    const videoTools = new Set([
      'create_video',
      'generate_video',
      'video_generate_multimodal',
      'video_plan',
      'proactive_plan',
      'clarify',
      'approval_required',
      'chat',
    ]);
    const toolStr = String(tool ?? '').toLowerCase();
    const planSteps = video.json?.plan?.steps ?? video.json?.proactivePlan?.steps;
    const hasVideoStep =
      Array.isArray(planSteps) &&
      planSteps.some((s) =>
        ['create_video', 'generate_video', 'video_plan', 'video_execute', 'video_generate_multimodal'].includes(
          String(s?.tool ?? s?.recommendedTool ?? '').toLowerCase(),
        ),
      );
    assert(
      videoTools.has(toolStr) || hasVideoStep || video.json?.success === true,
      `video intake did not route to video flow (tool=${tool})`,
    );
    pass(`Video creation intake (tool/action: ${tool ?? 'plan'})`);
  } catch (e) {
    fail('Video creation intake', e);
  }

  // Proactive runway tool resolution (runtime registry)
  try {
    const tools = [
      'create_store',
      'create_video',
      'analyze_store',
      'activate_campaigns',
      'deploy_to_cnet',
    ];
    for (const tool of tools) {
      const step = await request('POST', '/api/performer/proactive-step', {
        missionId: 'smoke-nonexistent-mission',
        stepNumber: 1,
        recommendedTool: tool,
        parameters: {},
      });
      // 404 mission not found is OK — means tool passed allowlist; 400 unsupported tool is failure
      const msg = JSON.stringify(step.json ?? {});
      assert(
        !msg.includes('Unsupported') && !msg.includes('not allowed') && step.status !== 400,
        `tool ${tool} rejected: ${step.status} ${msg.slice(0, 200)}`,
      );
    }
    pass('Proactive runway tools accepted by API allowlist');
  } catch (e) {
    fail('Proactive runway tools accepted by API allowlist', e);
  }

  console.log('\n--- Summary ---');
  const failed = results.filter((r) => !r.ok);
  for (const r of results) {
    console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.error ? ` — ${r.error}` : ''}`);
  }
  process.exit(failed.length ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
