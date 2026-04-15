/**
 * Loyalty Engine v1
 * Main entry point for loyalty engine exports
 */

// Re-export types
export * from './types.js';

// Re-export events
export * from './events.js';

// Re-export tool functions
export { configureProgram } from './configureProgram.js';
export { generateAssets } from './generateAssets.js';
export { queryCustomerStatus } from './queryCustomerStatus.js';
export { addStamp } from './addStamp.js';
export { redeemReward } from './redeemReward.js';

// Re-export tool definitions for orchestrator
export { loyaltyTools } from './loyaltyTools.js';

// Default export
export { loyaltyTools as default } from './loyaltyTools.js';



