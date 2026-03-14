#!/usr/bin/env node
/**
 * Module Loading Verification Script
 * 
 * Verifies that orchestra modules can be imported without SyntaxError.
 * Catches duplicate identifier declarations and circular import issues.
 * 
 * Usage:
 *   node scripts/verify-module-loading.js
 */

console.log('[Module Loading] Verifying orchestra module imports...\n');

try {
  console.log('  [1/3] Importing routingPlanSchema.js...');
  const routingPlanSchema = await import('../apps/core/cardbey-core/src/services/orchestra/routingPlanSchema.js');
  console.log('  [OK] routingPlanSchema.js loaded');
  console.log(`    - normalizeRoutingPlan: ${typeof routingPlanSchema.normalizeRoutingPlan}`);
  console.log(`    - getStageMode: ${typeof routingPlanSchema.getStageMode}`);
  console.log(`    - ROUTING_PLAN_VERSION: ${routingPlanSchema.ROUTING_PLAN_VERSION}`);
  
  console.log('\n  [2/3] Importing orchestraRoutingPlan.js...');
  const orchestraRoutingPlan = await import('../apps/core/cardbey-core/src/services/orchestra/orchestraRoutingPlan.js');
  console.log('  [OK] orchestraRoutingPlan.js loaded');
  console.log(`    - getOrCreateRoutingPlan: ${typeof orchestraRoutingPlan.getOrCreateRoutingPlan}`);
  
  console.log('\n  [3/3] Importing stageRunner.js...');
  const stageRunner = await import('../apps/core/cardbey-core/src/services/orchestra/stageRunner.js');
  console.log('  [OK] stageRunner.js loaded');
  console.log(`    - runJob: ${typeof stageRunner.runJob}`);
  
  console.log('\n[SUCCESS] All modules loaded without errors!');
  console.log('No duplicate identifier declarations detected.');
  process.exit(0);
} catch (error) {
  console.error('\n[FAIL] Module loading error:');
  console.error(`  Error: ${error.name}: ${error.message}`);
  
  if (error.message.includes('already been declared')) {
    console.error('\n  This indicates a duplicate identifier declaration.');
    console.error('  Search for duplicate imports or function declarations:');
    console.error('    rg -n "normalizeRoutingPlan" apps/core/cardbey-core/src/services/orchestra');
  }
  
  if (error.stack) {
    console.error('\n  Stack trace:');
    console.error(error.stack);
  }
  
  process.exit(1);
}




