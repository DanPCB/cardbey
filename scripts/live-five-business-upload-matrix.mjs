#!/usr/bin/env node
/**
 * Live five-business create-from-upload smoke against running core.
 * Draft / mission / form only — does not publish.
 *
 * Usage:
 *   node scripts/live-five-business-upload-matrix.mjs
 *   BASE_URL=http://127.0.0.1:3001 node scripts/live-five-business-upload-matrix.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE_URL = (process.env.BASE_URL || process.env.API_BASE || 'http://127.0.0.1:3001').replace(
  /\/$/,
  '',
);
const CARDS_DIR = path.resolve(
  __dirname,
  '../apps/core/cardbey-core/tmp/live-five-cards',
);
const RUN_ID = `live5-${Date.now().toString(36)}`;

/** @type {Array<{ id: string, file: string, expectName: RegExp, label: string }>} */
const BUSINESSES = [
  {
    id: 'awe_financial',
    file: 'awe.png',
    label: 'AWE FINANCIAL',
    expectName: /AWE/i,
  },
  {
    id: 'cellarbrations',
    file: 'cellar.png',
    label: 'CELLARBRATIONS DEER PARK',
    expectName: /CELLARBRATIONS/i,
  },
  {
    id: 'coffee_logo',
    file: 'coffee.png',
    label: 'Coffee',
    expectName: /Coffee/i,
  },
  {
    id: 'pth_construction',
    file: 'pth.png',
    label: 'PTH Construction',
    expectName: /PTH/i,
  },
  {
    id: 'noodle_hut',
    file: 'noodle.png',
    label: 'NOODLE hut',
    expectName: /NOODLE/i,
  },
];

function pngDataUrl(filePath) {
  const buf = fs.readFileSync(filePath);
  return `data:image/png;base64,${buf.toString('base64')}`;
}

async function jsonFetch(urlPath, { token, guestSession, body }) {
  const headers = {
    'Content-Type': 'application/json',
    'X-Guest-Session': guestSession,
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE_URL}${urlPath}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text.slice(0, 500) };
  }
  return { status: res.status, data };
}

function deepFindName(obj, depth = 0) {
  if (!obj || depth > 5) return '';
  if (typeof obj === 'string') return '';
  if (Array.isArray(obj)) {
    for (const item of obj) {
      const hit = deepFindName(item, depth + 1);
      if (hit) return hit;
    }
    return '';
  }
  if (typeof obj !== 'object') return '';
  const keys = [
    'businessName',
    'storeName',
    'name',
    'identityName',
    'boundBusinessName',
  ];
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'string' && v.trim() && v.trim().length < 120) {
      // skip generic UI copy
      if (!/^(create|store|draft|mission|other)$/i.test(v.trim())) return v.trim();
    }
  }
  if (obj.identity && typeof obj.identity.name === 'string' && obj.identity.name.trim()) {
    return obj.identity.name.trim();
  }
  for (const v of Object.values(obj)) {
    if (v && typeof v === 'object') {
      const hit = deepFindName(v, depth + 1);
      if (hit) return hit;
    }
  }
  return '';
}

function pickBoundName(data) {
  const draft = data?.storeCreationDraft ?? data?.payload?.storeCreationDraft ?? null;
  const summary = data?.storeMissionSummary ?? null;
  const params = data?.parameters ?? data?.classification?.parameters ?? null;
  const candidates = [
    draft?.name,
    draft?.storeName,
    draft?.businessName,
    summary?.businessName,
    summary?.storeName,
    params?.storeName,
    params?.businessName,
    data?.businessName,
    data?.fact?.businessName,
    data?.turnBelief?.identity?.name,
    deepFindName(data),
  ];
  for (const c of candidates) {
    const s = String(c ?? '').trim();
    if (s) return s;
  }
  const reply = String(data?.reply ?? data?.response ?? data?.message ?? data?.text ?? '');
  return reply.slice(0, 200);
}

function outcomeOk(biz, data) {
  const action = String(data?.action ?? '');
  const name = pickBoundName(data);
  const blob = `${name}\n${JSON.stringify(data ?? {}).slice(0, 4000)}`;
  const nameOk = biz.expectName.test(blob);
  const noNoodleLeak =
    biz.id === 'noodle_hut' || !/NOODLE\s*hut/i.test(String(name));
  // Identity success: OCR brand appears in payload and not stale NOODLE (except noodle case)
  if (nameOk && noNoodleLeak) {
    return { ok: true, reason: `identity_bound action=${action} name=${name || '(in payload)'}` };
  }
  if (action === 'upload_ask' || action === 'awaiting_perception') {
    return { ok: false, reason: `incomplete_flow action=${action} name=${name || '(none)'}` };
  }
  if (action === 'create_store' && !name) {
    return {
      ok: false,
      reason: `intent_engine_short_circuit action=create_store empty_params`,
    };
  }
  return { ok: false, reason: `identity_miss action=${action} name=${name || '(none)'}` };
}

async function registerUser(label) {
  const email = `${RUN_ID}-${label}-${Math.random().toString(36).slice(2, 7)}@cardbey.local`;
  const reg = await jsonFetch('/api/auth/register', {
    guestSession: `${RUN_ID}-auth-${label}`,
    body: {
      email,
      password: 'TestLive123!',
      fullName: `Live Five ${label}`,
    },
  });
  const token = reg.data?.token;
  if (!token) {
    throw new Error(`register failed for ${label}: ${reg.status} ${JSON.stringify(reg.data)}`);
  }
  return { email, token };
}

async function runBusiness(_sharedTokenUnused, biz) {
  const { token, email } = await registerUser(biz.id);
  const guestSession = `${RUN_ID}-${biz.id}-${Date.now().toString(36)}`;
  const conversationSessionId = `conv-${RUN_ID}-${biz.id}`;
  const filePath = path.join(CARDS_DIR, biz.file);
  if (!fs.existsSync(filePath)) {
    return { id: biz.id, ok: false, reason: `missing_fixture ${filePath}` };
  }
  const dataUrl = pngDataUrl(filePath);
  const turn2 = await jsonFetch('/api/performer/intake/v2', {
    token,
    guestSession,
    body: {
      text: 'Create store from uploaded card',
      message: 'Create store from uploaded card',
      intent: 'create_store',
      source: 'business_card',
      freshStoreMission: true,
      imageDataUrl: dataUrl,
      conversationSessionId,
      sessionId: conversationSessionId,
      intentSourceContext: {
        fromAskSelection: 'create_store',
        assetAction: 'create_store',
        type: 'CREATE_STORE_FROM_UPLOAD',
        storeCandidate: {
          businessName: 'NOODLE hut',
          location: '136 Station Street, VIC 3078',
        },
        cardExtraction: { businessName: 'NOODLE hut' },
      },
      intakeV2Selection: {
        selectedTool: 'create_store',
        selectedParameters: {
          source: 'upload_ask_selection',
          storeName: 'NOODLE hut',
          location: '136 Station Street, VIC 3078',
          _autoSubmit: true,
        },
      },
      currentContext: {},
      history: [],
    },
  });

  const data = turn2.data ?? {};
  const judged = outcomeOk(biz, data);
  return {
    id: biz.id,
    label: biz.label,
    ok: judged.ok,
    reason: judged.reason,
    userEmail: email,
    turn1Action: null,
    turn1Status: null,
    turn2Action: data?.action ?? null,
    turn2Status: turn2.status,
    boundName: pickBoundName(data),
    missionId: data?.missionId ?? null,
    draftId: data?.draftId ?? data?.storeCreationDraft?.draftId ?? null,
    snippet: String(data?.reply ?? data?.response ?? data?.message ?? data?.error ?? '').slice(0, 160),
    rawKeys: Object.keys(data || {}),
  };
}

async function runConflictCase(_sharedTokenUnused) {
  const { token, email } = await registerUser('conflict');
  const guestSession = `${RUN_ID}-conflict-${Date.now().toString(36)}`;
  const conversationSessionId = `conv-${RUN_ID}-conflict`;
  const coffeePath = path.join(CARDS_DIR, 'coffee.png');
  const dataUrl = pngDataUrl(coffeePath);
  const res = await jsonFetch('/api/performer/intake/v2', {
    token,
    guestSession,
    body: {
      text: 'Create store: NOODLE hut',
      message: 'Create store: NOODLE hut',
      intent: 'create_store',
      source: 'business_card',
      freshStoreMission: true,
      imageDataUrl: dataUrl,
      conversationSessionId,
      sessionId: conversationSessionId,
      intentSourceContext: {
        fromAskSelection: 'create_store',
        assetAction: 'create_store',
        type: 'CREATE_STORE_FROM_UPLOAD',
        storeCandidate: { businessName: 'NOODLE hut' },
      },
      intakeV2Selection: {
        selectedTool: 'create_store',
        selectedParameters: {
          source: 'upload_ask_selection',
          storeName: 'NOODLE hut',
          location: '136 Station Street, VIC 3078',
          _autoSubmit: true,
        },
      },
      storeCreateForm: {
        storeName: 'NOODLE hut',
        storeType: 'Food & drink',
        location: '136 Station Street, VIC 3078',
        intentMode: 'store',
      },
      currentContext: {},
      history: [],
    },
  });
  const action = String(res.data?.action ?? '');
  const name = pickBoundName(res.data);
  const reply = String(res.data?.reply ?? res.data?.response ?? res.data?.message ?? '');
  const blob = `${name}\n${reply}\n${JSON.stringify(res.data ?? {}).slice(0, 3000)}`;
  const blocked =
    action === 'turn_belief_blocked' ||
    action === 'clarify' ||
    /conflict/i.test(blob);
  const coffeeSeen = /Coffee/i.test(blob);
  const silentNoodleMission =
    action === 'store_mission_started' && /NOODLE/i.test(String(name)) && !coffeeSeen;
  const ok = blocked && coffeeSeen && !silentNoodleMission;
  return {
    id: 'conflict_coffee_vs_noodle',
    label: 'Coffee OCR vs Create store: NOODLE',
    ok,
    reason: ok
      ? `conflict_handled action=${action} name=${name}`
      : `unexpected_success_or_leak action=${action} name=${name} coffeeSeen=${coffeeSeen}`,
    userEmail: email,
    turn2Action: action,
    boundName: name,
    missionId: res.data?.missionId ?? null,
    snippet: reply.slice(0, 160),
  };
}

async function main() {
  console.log(`[live-five] BASE_URL=${BASE_URL} RUN_ID=${RUN_ID}`);

  const health = await fetch(`${BASE_URL}/api/health`).catch((e) => ({ ok: false, error: e }));
  if (!health.ok) {
    console.error('[FAIL] core not reachable');
    process.exit(1);
  }

  const email = `${RUN_ID}@cardbey.local`;
  // Shared register only for health of auth; each business gets its own user below.
  const reg = await jsonFetch('/api/auth/register', {
    guestSession: `${RUN_ID}-auth`,
    body: {
      email,
      password: 'TestLive123!',
      fullName: 'Live Five Matrix',
    },
  });
  if (!reg.data?.token) {
    console.error('[FAIL] register', reg.status, reg.data);
    process.exit(1);
  }
  console.log(`[live-five] auth ok (${email}); per-business users follow`);

  const results = [];
  for (const biz of BUSINESSES) {
    console.log(`[live-five] running ${biz.id}…`);
    const r = await runBusiness(null, biz);
    results.push(r);
    console.log(`  → ${r.ok ? 'PASS' : 'FAIL'} ${r.reason}`);
  }

  console.log('[live-five] running conflict case…');
  const conflict = await runConflictCase(null);
  results.push(conflict);
  console.log(`  → ${conflict.ok ? 'PASS' : 'FAIL'} ${conflict.reason}`);

  const passed = results.filter((r) => r.ok).length;
  const failed = results.length - passed;
  console.log('\n=== LIVE FIVE-BUSINESS REPORT ===');
  for (const r of results) {
    console.log(
      `${r.ok ? 'PASS' : 'FAIL'} | ${r.id} | action=${r.turn2Action ?? r.action ?? '-'} | name=${r.boundName ?? '-'} | ${r.reason}`,
    );
  }
  console.log(`\nSummary: ${passed}/${results.length} passed, ${failed} failed`);
  console.log(
    JSON.stringify(
      {
        runId: RUN_ID,
        baseUrl: BASE_URL,
        passed,
        failed,
        results,
      },
      null,
      2,
    ),
  );
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
