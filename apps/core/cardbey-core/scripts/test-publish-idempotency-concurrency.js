/**
 * Publish Idempotency Concurrency Torture Test (ESM)
 *
 * PowerShell:
 *   $env:BASE_URL="http://localhost:3001"
 *   $env:TEST_TOKEN="dev-admin-token"
 *   $env:CONCURRENCY="50"
 *   $env:JITTER_MS="30"
 *   $env:TIMEOUT_MS="60000"
 *   node scripts/test-publish-idempotency-concurrency.js
 *
 * What it does:
 *  1) Creates a fresh draft via /api/mi/orchestra/start to get generationRunId
 *  2) Fires CONCURRENCY concurrent POST /api/store/publish with SAME Idempotency-Key
 *  3) Asserts only 1 publishedStoreId is produced
 */

import crypto from "node:crypto";

const BASE_URL = process.env.BASE_URL || "http://localhost:3001";
const TOKEN = process.env.TEST_TOKEN || process.env.AUTH_TOKEN || "";
const CONCURRENCY = Number(process.env.CONCURRENCY || 50);
const JITTER_MS = Number(process.env.JITTER_MS || 0);
const TIMEOUT_MS = Number(process.env.TIMEOUT_MS || 60000);

if (!TOKEN) {
  console.error("❌ Missing TEST_TOKEN (or AUTH_TOKEN). Set $env:TEST_TOKEN in PowerShell.");
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const jitter = async () => {
  if (JITTER_MS > 0) await sleep(Math.floor(Math.random() * (JITTER_MS + 1)));
};

async function fetchJson(url, { method = "GET", headers = {}, body } = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    const text = await res.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      json = { raw: text };
    }
    return { status: res.status, body: json };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Step 1: Start build_store to obtain generationRunId.
 * If your start endpoint requires Idempotency-Key, provide one.
 */
async function createDraftAndGetGenerationRunId() {
  const idemKey = `idem-start-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`;

  const startPayload = {
    entryPoint: "build_store",
    input: {
      businessType: "cafe",
      businessName: "French Baguette",
      location: "Melbourne",
    },
  };

  const { status, body } = await fetchJson(`${BASE_URL}/api/mi/orchestra/start`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${TOKEN}`,
      "Idempotency-Key": idemKey,
    },
    body: startPayload,
  });

  if (status !== 200) {
    console.error("❌ Failed to start orchestration:", status, body);
    process.exit(1);
  }

  // Common shapes: { jobId, generationRunId } or similar
  const generationRunId = body.generationRunId || body.runId || body.generationRun?.id;
  const jobId = body.jobId;

  if (!generationRunId) {
    console.error("❌ orchestration/start response missing generationRunId. Body:", body);
    process.exit(1);
  }

  console.log("Draft generation started:");
  console.log("  jobId:", jobId || "(none)");
  console.log("  generationRunId:", generationRunId);

  return { generationRunId, jobId };
}

async function publishOnce({ generationRunId, idempotencyKey, index }) {
  await jitter();

  const payload = {
    storeId: "temp",
    generationRunId,
    // idempotencyKey can be in body too, but we send header as canonical
    // idempotencyKey,
  };

  const { status, body } = await fetchJson(`${BASE_URL}/api/store/publish`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${TOKEN}`,
      "Idempotency-Key": idempotencyKey,
    },
    body: payload,
  });

  return { index, status, body };
}

function summarize(results) {
  const counts = results.reduce(
    (acc, r) => {
      acc.total++;
      if (r.status === 200) acc.s200++;
      else if (r.status === 202) acc.s202++;
      else if (r.status === 409) acc.s409++;
      else acc.other++;
      return acc;
    },
    { total: 0, s200: 0, s202: 0, s409: 0, other: 0 }
  );

  const publishedStoreIds = results
    .filter((r) => r.status === 200)
    .map((r) => r.body?.publishedStoreId)
    .filter(Boolean);

  const uniqueStoreIds = [...new Set(publishedStoreIds)];

  const correlationIds = results
    .filter((r) => r.status === 202 || r.status === 409)
    .map((r) => r.body?.correlationId)
    .filter(Boolean);

  const uniqueCorrelationIds = [...new Set(correlationIds)];

  return { counts, uniqueStoreIds, uniqueCorrelationIds };
}

(async () => {
  console.log("====================================");
  console.log("Publish Idempotency Concurrency Torture Test");
  console.log("BASE_URL:", BASE_URL);
  console.log("CONCURRENCY:", CONCURRENCY);
  console.log("JITTER_MS:", JITTER_MS);
  console.log("TIMEOUT_MS:", TIMEOUT_MS);
  console.log("====================================\n");

  const { generationRunId } = await createDraftAndGetGenerationRunId();

  const publishIdemKey = `idem-publish-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
  console.log("\nPublish idempotencyKey:", publishIdemKey);

  const start = Date.now();

  const results = await Promise.all(
    Array.from({ length: CONCURRENCY }, (_, i) =>
      publishOnce({ generationRunId, idempotencyKey: publishIdemKey, index: i })
    )
  );

  const duration = Date.now() - start;

  const { counts, uniqueStoreIds, uniqueCorrelationIds } = summarize(results);

  console.log("\n--- Results ---");
  console.log("Completed in:", `${duration}ms`);
  console.log("Total responses:", counts.total);
  console.log("200 count:", counts.s200);
  console.log("202 count:", counts.s202);
  console.log("409 count:", counts.s409);
  console.log("Other status count:", counts.other);
  console.log("Unique publishedStoreIds (from 200s):", uniqueStoreIds);
  console.log("Unique correlationIds (from 202/409):", uniqueCorrelationIds);

  const sample = results.slice(0, 8).map((r) => ({
    index: r.index,
    status: r.status,
    body: r.body,
  }));
  console.log("\nSample (first 8):");
  for (const s of sample) {
    console.log(`  [${s.index}] status=${s.status} body=${JSON.stringify(s.body)}`);
  }

  // Acceptable statuses are 200/202. 409 can happen if first attempt failed; but in a healthy system this should be 0.
  const unexpected = results.filter((r) => ![200, 202, 409].includes(r.status));
  if (unexpected.length) {
    console.error("\n❌ FAIL: Unexpected HTTP status codes.");
    process.exit(1);
  }

  if (counts.other > 0) {
    console.error("\n❌ FAIL: Non-200/202/409 responses present.");
    process.exit(1);
  }

  if (counts.s200 < 1) {
    console.error("\n❌ FAIL: No 200 success responses. Publish never completed.");
    process.exit(1);
  }

  if (uniqueStoreIds.length !== 1) {
    console.error("\n❌ FAIL: Expected exactly 1 unique publishedStoreId from 200 responses.");
    process.exit(1);
  }

  console.log("\n✔ PASS (concurrency): only 1 publishedStoreId produced.");

  // Settle + verify cached replay returns 200 consistently
  console.log("\nWaiting 500ms then replaying publish 3x to ensure cache stability...");
  await sleep(500);

  const replays = [];
  for (let i = 0; i < 3; i++) {
    replays.push(await publishOnce({ generationRunId, idempotencyKey: publishIdemKey, index: `replay-${i}` }));
  }

  const replay200 = replays.filter((r) => r.status === 200);
  const replayStoreIds = [...new Set(replay200.map((r) => r.body?.publishedStoreId).filter(Boolean))];

  console.log("\nReplay results:");
  for (const r of replays) {
    console.log(`  [${r.index}] status=${r.status} body=${JSON.stringify(r.body)}`);
  }

  if (replayStoreIds.length !== 1 || replayStoreIds[0] !== uniqueStoreIds[0]) {
    console.error("\n❌ FAIL: Replay did not return the same publishedStoreId.");
    process.exit(1);
  }

  console.log("\n✔ PASS (replay): cached 200 returns same publishedStoreId.");
  console.log("\nPASS: Publish idempotency concurrency torture test.");
})();