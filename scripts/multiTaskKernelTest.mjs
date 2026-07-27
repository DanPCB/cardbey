#!/usr/bin/env node
/**
 * Multi-task kernel stress test — fires 3 concurrent Performer intake requests
 * against a running cardbey-core instance and validates mission isolation + Blackboard writes.
 *
 * Usage (from repo root):
 *   set NODE_PATH=apps/core/cardbey-core/node_modules   (Windows)
 *   NODE_PATH=apps/core/cardbey-core/node_modules node scripts/multiTaskKernelTest.mjs
 *   node scripts/multiTaskKernelTest.mjs --base=http://localhost:3001
 *
 * Auth: JWT for first DB user (or KERNEL_TEST_USER_ID + JWT_SECRET from cardbey-core .env).
 * Intake endpoint: POST /api/performer/intake/v2 (unified kernel entrypoint).
 *
 * Fallback storeId (when no seeded Business/Store in DB):
 *   HARDCODED_TEST_STORE_ID = 'test-store-kernel-smoke'
 *   Tasks B/C may clarify or fail without a real store — store creation (Task A) does not require one.
 */

import { config as loadEnv } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import jwt from 'jsonwebtoken';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CORE_ROOT = resolve(__dirname, '../apps/core/cardbey-core');
loadEnv({ path: resolve(CORE_ROOT, '.env') });
loadEnv({ path: resolve(CORE_ROOT, '../../.env') });

const BASE = (
  process.argv.find((a) => a.startsWith('--base='))?.slice(7) || 'http://localhost:3001'
).replace(/\/$/, '');

/** Resolved at startup — must match intake + runtime orchestrator auth. */
let AUTH = process.env.KERNEL_TEST_AUTH?.trim() ? `Bearer ${process.env.KERNEL_TEST_AUTH.trim()}` : '';
const POLL_MS = 3000;
const TIMEOUT_MS = 180_000; // Increase further on slow hardware.
const INTAKE_TIMEOUT_MS = 120_000;

/** Documented fallback when GET /api/stores returns empty. */
const HARDCODED_TEST_STORE_ID = 'test-store-kernel-smoke';

const TASKS = [
  {
    id: 'A',
    label: 'store creation',
    message: 'Create a store for a Melbourne café called Test Kernel Café',
    skillFamilyPatterns: [/create_store/i, /structured_store/i, /store/i, /pipeline/i, /runtime\.execution/i],
    needsStore: false,
  },
  {
    id: 'B',
    label: 'content / skill runtime',
    message: 'Generate a promotional flyer for a weekend brunch special',
    skillFamilyPatterns: [
      /poster/i,
      /flyer/i,
      /smart_visual/i,
      /promotion/i,
      /graphic/i,
      /content/i,
      /runtime\.skill/i,
    ],
    needsStore: true,
  },
  {
    id: 'C',
    label: 'memory / intelligence',
    message: 'What are the top 3 things I should improve about my store?',
    skillFamilyPatterns: [
      /analyze_store/i,
      /audit/i,
      /health/i,
      /growth/i,
      /analytics/i,
      /improve/i,
      /intelligence/i,
      /runtime\.skill/i,
    ],
    needsStore: true,
  },
];

function eventTypeOf(event) {
  return event?.eventType ?? event?.type ?? '';
}

function isBlackboardComplete(events) {
  return (
    events.length > 0 &&
    events.some(
      (e) =>
        eventTypeOf(e) === 'runtime.execution.completed' || eventTypeOf(e) === 'mission.completed',
    )
  );
}

function isMissionComplete(status, events) {
  return (
    status === 'done' ||
    status === 'failed' ||
    status === 'completed' ||
    isBlackboardComplete(events)
  );
}

function shortMissionId(missionId) {
  if (!missionId) return 'n/a';
  return missionId.length > 12 ? `${missionId.slice(0, 9)}...` : missionId;
}

async function resolveAuthToken() {
  if (AUTH) return AUTH;
  const secret = process.env.JWT_SECRET || 'change-me-in-production';
  const userId = process.env.KERNEL_TEST_USER_ID?.trim();
  if (userId) {
    AUTH = `Bearer ${jwt.sign({ userId }, secret, { expiresIn: '2h' })}`;
    return AUTH;
  }
  try {
    const { getPrismaClient } = await import(
      new URL('../apps/core/cardbey-core/src/lib/prisma.js', import.meta.url).href
    );
    const prisma = getPrismaClient();
    const user = await prisma.user.findFirst({ select: { id: true, email: true }, orderBy: { createdAt: 'asc' } });
    if (user?.id) {
      AUTH = `Bearer ${jwt.sign({ userId: user.id }, secret, { expiresIn: '2h' })}`;
      console.log(`[multiTaskKernelTest] auth=JWT userId=${user.id} (${user.email ?? 'n/a'})`);
      return AUTH;
    }
  } catch (err) {
    console.warn('[multiTaskKernelTest] Could not resolve DB user for JWT:', err?.message ?? err);
  }
  AUTH = 'Bearer dev-admin-token';
  console.warn(
    '[multiTaskKernelTest] auth=dev-admin-token (fallback) — proactive plan run-all may 403 due to guestAuth vs requireAuth user id mismatch',
  );
  return AUTH;
}

async function request(method, path, body, timeoutMs = 120_000) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(`${BASE}${path}`, {
      method,
      signal: ac.signal,
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
      json = { _raw: text.slice(0, 800) };
    }
    return { status: res.status, ok: res.ok, json };
  } catch (err) {
    const msg = err?.cause?.code ? `${err.message} (${err.cause.code})` : err?.message ?? String(err);
    return { status: 0, ok: false, json: null, error: msg };
  } finally {
    clearTimeout(timer);
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function extractMissionId(intakeJson) {
  if (!intakeJson || typeof intakeJson !== 'object') return null;
  return (
    intakeJson.missionId ??
    intakeJson.storeMissionSummary?.missionId ??
    intakeJson.plan?.missionId ??
    intakeJson.metadata?.missionId ??
    null
  );
}

async function resolveStoreId() {
  const stores = await request('GET', '/api/stores?limit=5');
  if (stores.ok && Array.isArray(stores.json?.stores) && stores.json.stores.length > 0) {
    const id = stores.json.stores[0]?.id ?? stores.json.stores[0]?.storeId;
    if (id) return { storeId: String(id), source: 'api/stores' };
  }

  const discovery = await request('GET', '/api/discovery/business/search?limit=1');
  const biz =
    discovery.json?.businesses?.[0] ??
    discovery.json?.results?.[0] ??
    discovery.json?.items?.[0];
  if (biz?.id) return { storeId: String(biz.id), source: 'discovery/business/search' };

  return { storeId: HARDCODED_TEST_STORE_ID, source: 'hardcoded fallback (no DB seed found)' };
}

async function pollMissionUntilDone(missionId) {
  const start = Date.now();
  let lastStatus = 'unknown';
  let lastBody = null;
  let lastEvents = [];

  while (Date.now() - start < TIMEOUT_MS) {
    const [res, bb] = await Promise.all([
      request('GET', `/api/missions/${encodeURIComponent(missionId)}`),
      fetchBlackboard(missionId),
    ]);
    lastBody = res.json;
    lastEvents = bb.events;
    const status = String(res.json?.mission?.status ?? res.json?.status ?? 'unknown').toLowerCase();
    lastStatus = status;

    if (isMissionComplete(status, lastEvents)) {
      return {
        done: true,
        status,
        elapsedMs: Date.now() - start,
        body: lastBody,
        events: lastEvents,
        completedViaBlackboard: isBlackboardComplete(lastEvents),
      };
    }

    await sleep(POLL_MS);
  }

  return {
    done: false,
    status: lastStatus,
    elapsedMs: TIMEOUT_MS,
    body: lastBody,
    events: lastEvents,
    completedViaBlackboard: false,
  };
}

async function fetchBlackboard(missionId) {
  const res = await request('GET', `/api/missions/${encodeURIComponent(missionId)}/blackboard?limit=200`);
  if (!res.ok) {
    return { ok: false, events: [], error: res.json?.message ?? res.json?.error ?? `HTTP ${res.status}` };
  }
  const events = Array.isArray(res.json?.events) ? res.json.events : [];
  return { ok: true, events, error: null };
}

function eventMatchesSkillFamily(event, patterns) {
  const haystack = [
    eventTypeOf(event),
    event?.agentId,
    event?.source,
    JSON.stringify(event?.payload ?? {}),
  ]
    .filter(Boolean)
    .join(' ');
  return patterns.some((re) => re.test(haystack));
}

function detectCrossContamination(missionIds, blackboards) {
  const issues = [];
  const idSet = new Set(missionIds.filter(Boolean));

  for (const [missionId, bb] of Object.entries(blackboards)) {
    for (const ev of bb.events ?? []) {
      if (ev.missionId && ev.missionId !== missionId) {
        issues.push(`Mission ${missionId}: event seq=${ev.seq} has foreign missionId=${ev.missionId}`);
      }
      const payloadStr = JSON.stringify(ev.payload ?? {});
      for (const otherId of idSet) {
        if (otherId === missionId) continue;
        if (payloadStr.includes(otherId)) {
          issues.push(`Mission ${missionId}: event seq=${ev.seq} payload references other mission ${otherId}`);
        }
      }
    }
  }

  return issues;
}

async function runTask(task, storeId) {
  const started = Date.now();
  const body = {
    message: task.message,
    currentContext: task.needsStore ? { storeId, activeStoreId: storeId } : {},
    storeId: task.needsStore ? storeId : undefined,
    history: [],
  };

  const intake = await request('POST', '/api/performer/intake/v2', body, INTAKE_TIMEOUT_MS);
  if (intake.error) {
    return {
      task,
      pass: false,
      reason: intake.error,
      elapsedSec: Math.round((Date.now() - started) / 1000),
    };
  }
  if (!intake.ok) {
    return {
      task,
      pass: false,
      reason: `intake HTTP ${intake.status}`,
      detail: intake.json,
      elapsedSec: Math.round((Date.now() - started) / 1000),
    };
  }

  const missionId = extractMissionId(intake.json);
  if (!missionId) {
    const action = intake.json?.action ?? intake.json?.success;
    return {
      task,
      pass: false,
      reason: `no missionId (action=${action})`,
      detail: intake.json,
      elapsedSec: Math.round((Date.now() - started) / 1000),
    };
  }

  // Kick queued proactive-plan missions through the runtime orchestrator (kernel path).
  await request(
    'POST',
    `/api/runtime/missions/${encodeURIComponent(missionId)}/run-all`,
    { source: 'multiTaskKernelTest' },
    120_000,
  );

  const poll = await pollMissionUntilDone(missionId);
  const events = poll.events ?? [];
  const eventCount = events.length;
  const hasSkillEvent = events.some((ev) => eventMatchesSkillFamily(ev, task.skillFamilyPatterns));
  const elapsedSec = Math.round((Date.now() - started) / 1000);

  if (!poll.done) {
    return {
      task,
      pass: false,
      missionId,
      reason: `timeout after ${TIMEOUT_MS / 1000}s`,
      lastStatus: poll.status,
      detail: poll.body,
      elapsedSec,
      blackboardEvents: eventCount,
      events,
    };
  }

  const pass = eventCount >= 1 && hasSkillEvent;

  return {
    task,
    pass,
    missionId,
    status: poll.status,
    blackboardEvents: eventCount,
    hasSkillEvent,
    events,
    detail: poll.body,
    elapsedSec,
    completedViaBlackboard: poll.completedViaBlackboard ?? false,
    reason: pass
      ? null
      : !eventCount
        ? 'no blackboard events'
        : !hasSkillEvent
          ? 'no event matching expected skill family'
          : 'poll finished without usable completion signal',
  };
}

async function main() {
  console.log(`[multiTaskKernelTest] BASE=${BASE}`);
  await resolveAuthToken();

  const health = await request('GET', '/api/health');
  if (!health.ok || health.json?.ok !== true) {
    console.error(
      '[multiTaskKernelTest] Server not reachable at',
      BASE,
      '— start cardbey-core on port 3001 first.',
    );
    process.exit(1);
  }

  const { storeId, source: storeSource } = await resolveStoreId();
  console.log(`[multiTaskKernelTest] storeId=${storeId} (${storeSource})`);

  const settled = await Promise.allSettled(TASKS.map((task) => runTask(task, storeId)));

  const results = settled.map((s, i) => {
    if (s.status === 'fulfilled') return s.value;
    return {
      task: TASKS[i],
      pass: false,
      reason: s.reason?.message ?? String(s.reason),
      elapsedSec: 0,
    };
  });

  const blackboards = {};
  const missionIds = [];
  for (const r of results) {
    if (r.missionId) {
      missionIds.push(r.missionId);
      blackboards[r.missionId] = { events: r.events ?? [] };
    }
  }

  const contamination = detectCrossContamination(missionIds, blackboards);
  const isolated = contamination.length === 0;

  console.log('');
  for (const r of results) {
    const tag = r.pass ? 'PASS' : 'FAIL';
    const mid = r.missionId ? `missionId ${r.missionId}` : 'no missionId';
    const timing = r.elapsedSec != null ? `completed in ${r.elapsedSec}s` : '';
    const bb = r.blackboardEvents != null ? `Blackboard events: ${r.blackboardEvents}` : '';
    const extra = [timing, bb].filter(Boolean).join(' — ');
    console.log(`[${tag}] Task ${r.task.id} — ${mid}${extra ? ` — ${extra}` : ''}`);
    if (!r.pass && r.reason) {
      console.log(`         reason: ${r.reason}`);
      if (r.lastStatus) console.log(`         last status: ${r.lastStatus}`);
      const lastEv = (r.events ?? []).at(-1);
      if (lastEv) {
        console.log(
          `         last Blackboard: type=${lastEv.eventType} agent=${lastEv.agentId ?? 'n/a'}`,
        );
      } else if (r.detail) {
        console.log(`         intake/response: ${JSON.stringify(r.detail).slice(0, 240)}`);
      }
    }
  }

  console.log('');
  console.log('--- Summary ---');
  for (const r of results) {
    const tag = r.pass ? 'PASS' : 'FAIL';
    const eventsLabel = r.blackboardEvents != null ? `${r.blackboardEvents} events` : '0 events';
    console.log(
      `Mission ${r.task.id} | ${shortMissionId(r.missionId)} | ${tag} | ${r.elapsedSec ?? 0}s | ${eventsLabel}`,
    );
  }
  console.log(`Isolation: ${isolated ? 'PASS' : 'FAIL'}`);

  if (!isolated) {
    for (const issue of contamination) console.log(`  - ${issue}`);
  }

  const allPass = results.every((r) => r.pass) && isolated;
  process.exit(allPass ? 0 : 1);
}

main().catch((err) => {
  console.error('[multiTaskKernelTest] FATAL', err);
  process.exit(1);
});
