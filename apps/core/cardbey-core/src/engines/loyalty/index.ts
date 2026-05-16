/**
 * Loyalty Engine v1
 * Main entry point for loyalty engine exports
 */

export * from './types.js';
export * from './loyaltyTools.js';
export * from './configureProgram.js';
export * from './generateAssets.js';
export * from './queryCustomerStatus.js';
export * from './addStamp.js';
export * from './redeemReward.js';
export * from './events.js';

// Export tool definitions for orchestrator
export { loyaltyTools } from './loyaltyTools.js';
export type { ToolDefinition } from './loyaltyTools.js';

import { loyaltyTools } from './loyaltyTools.js';
export default loyaltyTools;

