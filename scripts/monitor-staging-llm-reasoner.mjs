#!/usr/bin/env node
/**
 * Monitor staging LLM reasoner health and intake classification sources.
 *
 * Usage:
 *   STAGING_URL=https://staging.example.com node scripts/monitor-staging-llm-reasoner.mjs
 */

const STAGING_URL = (process.env.STAGING_URL || 'http://localhost:3001').replace(/\/+$/, '');

async function fetchJson(path) {
  const res = await fetch(`${STAGING_URL}${path}`);
  if (!res.ok) {
    throw new Error(`${path} → HTTP ${res.status}`);
  }
  return res.json();
}

async function main() {
  console.log('📊 Monitoring LLM Reasoner on staging\n');
  console.log(`Target: ${STAGING_URL}\n`);

  const t0 = Date.now();
  try {
    const health = await fetchJson('/api/health?full=true');
    console.log(`✅ Health: ${health.status ?? health.ok ?? 'unknown'} (uptime: ${health.uptimeSec ?? '?'}s)`);
  } catch (err) {
    console.error(`❌ Health check failed: ${err.message}`);
  }
  const healthMs = Date.now() - t0;
  console.log(`   Latency: ${healthMs}ms`);

  try {
    const features = await fetchJson('/api/status/features');
    const llm = features?.llm ?? features?.features?.llm;
    console.log('\n🤖 LLM feature status:', llm?.available ? 'available' : 'unavailable');
    if (llm?.provider) console.log(`   Provider: ${llm.provider}`);
  } catch {
    console.log('\n🤖 LLM feature status: (endpoint unavailable)');
  }

  console.log('\n📈 Classification sources (check telemetry / logs):');
  console.log('   - llm_reasoner');
  console.log('   - llm_reasoner_fallback');
  console.log('   - intent_reasoner');
  console.log('\nEnv flags to verify on core:');
  console.log(`   ENABLE_LLM_REASONER=${process.env.ENABLE_LLM_REASONER ?? '(set on server)'}`);
  console.log(`   ENABLE_LLM_TOOL_LOOP=${process.env.ENABLE_LLM_TOOL_LOOP ?? '(set on server)'}`);
  console.log(`   ENABLE_LLM_THINKING=${process.env.ENABLE_LLM_THINKING ?? '(set on server)'}`);

  try {
    const report = await fetchJson('/api/diagnostics/health-report');
    console.log('\n🚨 Diagnostics errorCount:', report?.errorCount ?? report?.errors?.length ?? 0);
  } catch {
    console.log('\n🚨 Diagnostics: (endpoint unavailable)');
  }

  console.log('\n✅ Monitoring complete');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
