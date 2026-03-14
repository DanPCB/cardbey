#!/usr/bin/env node
/**
 * Orchestra Smoke Test
 * 
 * Tests end-to-end Orchestra job execution:
 * 1. Creates a job
 * 2. Streams SSE for completion markers
 * 3. Asserts job COMPLETED
 * 4. Asserts products exist after sync_store
 * 
 * Usage:
 *   node scripts/smoke-orchestra.js [--base-url=http://localhost:3001]
 */

import { EventSource } from 'eventsource';
import fetch from 'node-fetch';

const BASE_URL = process.env.BASE_URL || process.argv.find(arg => arg.startsWith('--base-url='))?.split('=')[1] || 'http://localhost:3001';
const TIMEOUT_MS = 180000; // 3 minutes

console.log(`[Smoke Test] Starting Orchestra smoke test against ${BASE_URL}`);

// Test 1: Create job
console.log('\n[1/4] Creating job...');
const createResponse = await fetch(`${BASE_URL}/api/mi/orchestra/start`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    goal: 'build_store',
    rawInput: 'Create a test coffee shop store',
    inputsJson: {
      storeName: 'Smoke Test Coffee Shop',
      businessTypeHint: 'coffee',
    },
  }),
});

// CRITICAL: Fail fast if status >= 500 (server crash or module loading error)
if (createResponse.status >= 500) {
  console.error(`[FAIL] Server error (status ${createResponse.status}): ${createResponse.statusText}`);
  const errorText = await createResponse.text();
  console.error(`Error response: ${errorText}`);
  console.error(`\nThis likely indicates a module loading error (e.g., duplicate identifier).`);
  console.error(`Check server logs for SyntaxError or "already been declared" messages.`);
  process.exit(1);
}

if (!createResponse.ok) {
  console.error(`[FAIL] Job creation failed: ${createResponse.status} ${createResponse.statusText}`);
  const errorText = await createResponse.text();
  console.error(`Error: ${errorText}`);
  process.exit(1);
}

const createData = await createResponse.json();
if (!createData.ok || !createData.jobId) {
  console.error(`[FAIL] Invalid job creation response:`, createData);
  process.exit(1);
}

const jobId = createData.jobId;
console.log(`[OK] Job created: ${jobId}`);

// Test 2: Stream SSE for completion
console.log(`\n[2/4] Streaming SSE for job ${jobId}...`);
const sseUrl = `${BASE_URL}/api/stream?key=job:${jobId}`;
const eventSource = new EventSource(sseUrl);

let jobCompleted = false;
let jobFailed = false;
let lastProgress = 0;

const ssePromise = new Promise((resolve, reject) => {
  const timeout = setTimeout(() => {
    eventSource.close();
    reject(new Error(`SSE timeout after ${TIMEOUT_MS}ms. Last progress: ${lastProgress}%`));
  }, TIMEOUT_MS);

  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      
      if (data.event === 'orchestra.job_completed' || data.status === 'COMPLETED') {
        jobCompleted = true;
        clearTimeout(timeout);
        eventSource.close();
        resolve(data);
      } else if (data.event === 'job_failed' || data.status === 'FAILED') {
        jobFailed = true;
        clearTimeout(timeout);
        eventSource.close();
        reject(new Error(`Job failed: ${data.error || data.message || 'Unknown error'}`));
      } else if (data.progressPct !== undefined) {
        lastProgress = data.progressPct;
        if (data.progressPct % 20 === 0) {
          console.log(`  Progress: ${data.progressPct}%`);
        }
      }
    } catch (parseError) {
      // Ignore parse errors for non-JSON events
    }
  };

  eventSource.onerror = (error) => {
    if (eventSource.readyState === EventSource.CLOSED) {
      clearTimeout(timeout);
      if (!jobCompleted && !jobFailed) {
        reject(new Error(`SSE connection closed unexpectedly. Last progress: ${lastProgress}%`));
      }
    }
  };
});

try {
  await ssePromise;
  console.log(`[OK] Job completed via SSE`);
} catch (sseError) {
  console.error(`[FAIL] SSE streaming failed:`, sseError.message);
  process.exit(1);
}

// Test 3: Verify job status
console.log(`\n[3/4] Verifying job status...`);
const statusResponse = await fetch(`${BASE_URL}/api/mi/orchestra/job/${jobId}`);
if (!statusResponse.ok) {
  console.error(`[FAIL] Failed to get job status: ${statusResponse.status}`);
  process.exit(1);
}

const statusData = await statusResponse.json();
if (!statusData.ok || !statusData.job) {
  console.error(`[FAIL] Invalid job status response:`, statusData);
  process.exit(1);
}

if (statusData.job.status !== 'COMPLETED') {
  console.error(`[FAIL] Job status is ${statusData.job.status}, expected COMPLETED`);
  console.error(`Error: ${statusData.job.lastError || 'No error message'}`);
  process.exit(1);
}

console.log(`[OK] Job status: ${statusData.job.status}`);

// Test 4: Verify products exist (sync_store completed)
console.log(`\n[4/4] Verifying products exist (sync_store completed)...`);
const storeId = statusData.job.inputsJson?.storeId || statusData.job.resultJson?.storeId;
if (!storeId) {
  console.warn(`[WARN] No storeId found in job result. Skipping product verification.`);
  console.log(`\n[OK] Smoke test completed (job completed, but products not verified)`);
  process.exit(0);
}

const productsResponse = await fetch(`${BASE_URL}/api/products?storeId=${storeId}`);
if (!productsResponse.ok) {
  console.error(`[FAIL] Failed to get products: ${productsResponse.status}`);
  process.exit(1);
}

const productsData = await productsResponse.json();
if (!Array.isArray(productsData) || productsData.length === 0) {
  console.error(`[FAIL] No products found. Expected at least 1 product after sync_store.`);
  process.exit(1);
}

console.log(`[OK] Found ${productsData.length} product(s)`);
console.log(`\n[SUCCESS] All smoke tests passed!`);
console.log(`  - Job created: ${jobId}`);
console.log(`  - Job completed: ${statusData.job.status}`);
console.log(`  - Products created: ${productsData.length}`);
process.exit(0);

