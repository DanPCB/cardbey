/**
 * Quick Verification Script
 * Checks if MenuVisualAgent feature flag is enabled
 * 
 * Usage: node scripts/verify-feature-flag.js
 */

import { loadEnv, getFeatureFlag } from '../src/env/loadEnv.js';

// Load environment variables
loadEnv();

// Check feature flag
const isEnabled = getFeatureFlag('ENABLE_MENU_VISUAL_AGENT', false);

console.log('\n╔══════════════════════════════════════════════╗');
console.log('║  MenuVisualAgent Feature Flag Verification  ║');
console.log('╚══════════════════════════════════════════════╝\n');

console.log('Feature Flag Status:');
console.log(`  ENABLE_MENU_VISUAL_AGENT: ${process.env.ENABLE_MENU_VISUAL_AGENT || '(not set)'}`);
console.log(`  Parsed Value: ${isEnabled ? '✅ TRUE' : '❌ FALSE'}\n`);

if (isEnabled) {
  console.log('✅ Feature is ENABLED');
  console.log('   - Backend should return menu_visual_agent_v1: true');
  console.log('   - Frontend should show menu_visual_agent_v1: true');
  console.log('   - Image generation jobs will be queued after menu OCR\n');
} else {
  console.log('❌ Feature is DISABLED');
  console.log('   - Set ENABLE_MENU_VISUAL_AGENT=true in .env file');
  console.log('   - Restart both API server and worker\n');
}

process.exit(isEnabled ? 0 : 1);

