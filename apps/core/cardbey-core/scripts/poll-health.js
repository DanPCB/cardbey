#!/usr/bin/env node
/**
 * Health Polling Script
 * Polls /api/health every 5 seconds and pretty-prints status
 * Windows-compatible (no bash-isms)
 */

const API_BASE = process.env.API_BASE || 'http://localhost:3001';
const POLL_INTERVAL = 5000; // 5 seconds

function formatStatus(health) {
  const statusIcon = (ok) => ok ? '✅' : '❌';
  
  console.log('\n' + '='.repeat(60));
  console.log(`Health Status - ${new Date().toLocaleTimeString()}`);
  console.log('='.repeat(60));
  console.log(`Version: ${health.version || 'unknown'}`);
  console.log(`Uptime: ${health.uptimeSec || 0}s`);
  console.log('');
  console.log('Components:');
  console.log(`  API:       ${statusIcon(health.api?.ok)} ${health.api?.ok ? 'OK' : 'ERROR'}`);
  console.log(`  Database:  ${statusIcon(health.database?.ok)} ${health.database?.ok ? 'OK' : 'ERROR'} ${health.database?.dialect ? `(${health.database.dialect})` : ''} ${health.database?.latencyMs ? `[${health.database.latencyMs}ms]` : ''}`);
  console.log(`  Scheduler: ${statusIcon(health.scheduler?.ok)} ${health.scheduler?.ok ? 'OK' : 'ERROR'} ${health.scheduler?.lastHeartbeat ? `[${new Date(health.scheduler.lastHeartbeat).toLocaleTimeString()}]` : ''}`);
  console.log(`  SSE:       ${statusIcon(health.sse?.ok)} ${health.sse?.ok ? 'OK' : 'ERROR'} ${health.sse?.path || ''}`);
  const oauthProviders = health.oauth?.providers?.length ? health.oauth.providers.join(', ') : '[none]';
  console.log(`  OAuth:     ${statusIcon(health.oauth?.ok)} ${health.oauth?.ok ? 'OK' : 'ERROR'} ${oauthProviders}`);
  console.log('='.repeat(60));
}

async function checkHealth() {
  try {
    const response = await fetch(`${API_BASE}/api/health`);
    if (!response.ok) {
      console.error(`❌ Health check failed: ${response.status} ${response.statusText}`);
      return;
    }
    const health = await response.json();
    formatStatus(health);
  } catch (error) {
    console.error(`❌ Failed to fetch health: ${error.message}`);
    console.log('💡 Make sure the server is running on', API_BASE);
  }
}

// Wait a bit for server to start, then begin polling
setTimeout(() => {
  // Initial check
  checkHealth();
  
  // Poll every 5 seconds
  setInterval(checkHealth, POLL_INTERVAL);
}, 2000);

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n👋 Health monitor stopped');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n👋 Health monitor stopped');
  process.exit(0);
});

