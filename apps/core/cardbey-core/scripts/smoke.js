/**
 * Smoke test for Cardbey Core API
 * Validates critical endpoints are working
 * 
 * Usage:
 *   npm run smoke:dev (for local testing)
 *   npm run smoke (uses default API_BASE)
 */

const API_BASE = process.env.API_BASE || 'http://localhost:3001';

async function runSmokeTests() {
  console.log('🧪 Cardbey Core API - Smoke Test Suite\n');
  console.log(`📍 Target: ${API_BASE}\n`);
  
  const tests = [
    { name: 'Health Check', url: `${API_BASE}/health`, method: 'GET' },
    { name: 'Journey Templates', url: `${API_BASE}/api/journeys/templates`, method: 'GET' },
    { name: 'Guest Assistant', url: `${API_BASE}/api/assistant/guest`, method: 'POST', body: {} },
    { name: 'AI Metrics', url: `${API_BASE}/api/ai/metrics`, method: 'GET' },
    { name: 'Feature Flags', url: `${API_BASE}/api/v2/flags`, method: 'GET' },
    { name: 'Home Sections', url: `${API_BASE}/api/v2/home/sections`, method: 'GET' },
    { name: 'OAuth Status', url: `${API_BASE}/api/oauth/status`, method: 'GET' },
  ];
  
  let passed = 0;
  let failed = 0;
  const failures = [];
  
  for (const test of tests) {
    try {
      const response = await fetch(test.url, {
        method: test.method,
        headers: { 'Content-Type': 'application/json' },
        body: test.body ? JSON.stringify(test.body) : undefined
      });
      
      if (response.ok) {
        console.log(`✅ ${test.name.padEnd(25)} (${response.status})`);
        passed++;
      } else {
        const errorText = await response.text();
        console.log(`❌ ${test.name.padEnd(25)} (${response.status})`);
        failures.push({ test: test.name, status: response.status, error: errorText });
        failed++;
      }
    } catch (err) {
      console.log(`❌ ${test.name.padEnd(25)} (${err.message})`);
      failures.push({ test: test.name, error: err.message });
      failed++;
    }
  }
  
  // SSE test (connection only, don't wait for data)
  console.log('\n🔄 Testing SSE endpoints...');
  const sseTests = [
    { name: 'SSE Stream', url: `${API_BASE}/api/stream` },
    { name: 'AI SSE Stream', url: `${API_BASE}/api/ai/stream` },
  ];
  
  for (const sseTest of sseTests) {
    try {
      const response = await fetch(sseTest.url);
      if (response.headers.get('content-type')?.includes('text/event-stream')) {
        console.log(`✅ ${sseTest.name.padEnd(25)} (streaming)`);
        passed++;
        // Close the connection immediately
        response.body?.cancel();
      } else {
        console.log(`❌ ${sseTest.name.padEnd(25)} (not streaming)`);
        failures.push({ test: sseTest.name, error: 'Not a valid SSE endpoint' });
        failed++;
      }
    } catch (err) {
      console.log(`❌ ${sseTest.name.padEnd(25)} (${err.message})`);
      failures.push({ test: sseTest.name, error: err.message });
      failed++;
    }
  }
  
  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 Test Results');
  console.log('='.repeat(60));
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`📈 Total:  ${passed + failed}`);
  
  if (failures.length > 0) {
    console.log('\n💥 Failed Tests:');
    failures.forEach((f, i) => {
      console.log(`\n${i + 1}. ${f.test}`);
      if (f.status) console.log(`   Status: ${f.status}`);
      if (f.error) console.log(`   Error: ${f.error.substring(0, 200)}`);
    });
  }
  
  console.log('\n' + '='.repeat(60));
  
  if (failed > 0) {
    console.log('❌ Smoke tests failed!');
    process.exit(1);
  } else {
    console.log('✅ All smoke tests passed!');
    process.exit(0);
  }
}

// Handle fetch errors gracefully
if (typeof fetch === 'undefined') {
  console.error('❌ Error: fetch is not available. Run this script with Node.js 18+ or install node-fetch.');
  process.exit(1);
}

runSmokeTests().catch(err => {
  console.error('❌ Smoke test suite failed:', err);
  process.exit(1);
});






