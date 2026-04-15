/**
 * Concurrency Torture Test for /api/mi/orchestra/start (ESM)
 * Usage (PowerShell):
 *   $env:BASE_URL="http://localhost:3001"
 *   $env:AUTH_TOKEN="..."   # optional
 *   node scripts/test-orchestra-idempotency-concurrency.js
 */

import crypto from "node:crypto";

const BASE_URL = process.env.BASE_URL || "http://localhost:3001";
const AUTH_TOKEN = process.env.AUTH_TOKEN || null;

const CONCURRENCY = Number(process.env.CONCURRENCY || 30);
const TIMEOUT_MS = Number(process.env.TIMEOUT_MS || 30000);

// New key each run
const idempotencyKey = `torture-${crypto.randomBytes(4).toString("hex")}`;

// Adjust payload to match your API contract if needed
const payload = {
  entryPoint: "build_store",
  input: {
    businessType: "cafe",
    businessName: "French Baguette",
    location: "Melbourne",
  },
};

async function fireRequest(index) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(`${BASE_URL}/api/mi/orchestra/start`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
        ...(AUTH_TOKEN ? { Authorization: `Bearer ${AUTH_TOKEN}` } : {}),
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    const text = await res.text();
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      body = { raw: text };
    }

    return { index, status: res.status, body };
  } catch (err) {
    return { index, error: err?.message || String(err) };
  } finally {
    clearTimeout(timeout);
  }
}

function summarize(results) {
  const errors = results.filter((r) => r.error);
  const badStatuses = results.filter((r) => r.status && ![200, 202].includes(r.status));

  const jobIds = results.map((r) => r.body?.jobId).filter(Boolean);
  const uniqueJobIds = [...new Set(jobIds)];

  const correlationIds = results.map((r) => r.body?.correlationId).filter(Boolean);
  const uniqueCorrelationIds = [...new Set(correlationIds)];

  return { errors, badStatuses, jobIds, uniqueJobIds, correlationIds, uniqueCorrelationIds };
}

(async () => {
  console.log("====================================");
  console.log("Concurrency Torture Test (ESM)");
  console.log("BASE_URL:", BASE_URL);
  console.log("IdempotencyKey:", idempotencyKey);
  console.log("Concurrency:", CONCURRENCY);
  console.log("Timeout(ms):", TIMEOUT_MS);
  console.log("====================================\n");

  const start = Date.now();

  const results = await Promise.all(
    Array.from({ length: CONCURRENCY }, (_, i) => fireRequest(i))
  );

  const ms = Date.now() - start;
  console.log(`All requests completed in ${ms}ms\n`);

  const { errors, badStatuses, uniqueJobIds, uniqueCorrelationIds } = summarize(results);

  if (errors.length) {
    console.error("❌ Errors occurred:");
    console.error(errors.slice(0, 10));
    process.exit(1);
  }

  if (badStatuses.length) {
    console.error("❌ Unexpected HTTP statuses (showing up to 10):");
    console.error(badStatuses.slice(0, 10));
    process.exit(1);
  }

  console.log("Total responses:", results.length);
  console.log("Unique jobIds returned:", uniqueJobIds.length);
  console.log("Unique jobIds:", uniqueJobIds);
  console.log("Unique correlationIds returned:", uniqueCorrelationIds.length);
  console.log("Unique correlationIds:", uniqueCorrelationIds);

  if (uniqueJobIds.length !== 1) {
    console.error("\n❌ FAILURE: Multiple jobIds detected! Dumping sample responses:");
    console.error(results.slice(0, 5));
    process.exit(1);
  }

  console.log("\n✔ All responses returned the same jobId.");
  console.log("✔ Concurrency torture test PASSED (API-level).");
  console.log("\nDB verification (recommended): confirm only 1 OrchestratorTask exists for this run.");
  console.log("Tip: search by correlationId or by createdAt window.");
})();
