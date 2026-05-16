/**
 * Loyalty Engine Tools
 * Tool definitions for orchestrator integration
 */

import {
  configureProgram,
  generateAssets,
  queryCustomerStatus,
  addStamp,
  redeemReward,
} from './index.js';

import {
  ConfigureProgramInput,
  ConfigureProgramOutput,
  GenerateAssetsInput,
  GenerateAssetsOutput,
  QueryCustomerStatusInput,
  QueryCustomerStatusOutput,
  AddStampInput,
  AddStampOutput,
  RedeemRewardInput,
  RedeemRewardOutput,
} from './types.js';

/**
 * Loyalty Engine Tools Registry
 * Array of tool definitions for orchestrator integration
 */
export const loyaltyTools = [
  {
    engineId: 'loyalty',
    toolName: 'loyalty.configure-program',
    inputSchema: ConfigureProgramInput,
    outputSchema: ConfigureProgramOutput,
    handler: configureProgram,
  },
  {
    engineId: 'loyalty',
    toolName: 'loyalty.generate-assets',
    inputSchema: GenerateAssetsInput,
    outputSchema: GenerateAssetsOutput,
    handler: generateAssets,
  },
  {
    engineId: 'loyalty',
    toolName: 'loyalty.query-customer-status',
    inputSchema: QueryCustomerStatusInput,
    outputSchema: QueryCustomerStatusOutput,
    handler: queryCustomerStatus,
  },
  {
    engineId: 'loyalty',
    toolName: 'loyalty.add-stamp',
    inputSchema: AddStampInput,
    outputSchema: AddStampOutput,
    handler: addStamp,
  },
  {
    engineId: 'loyalty',
    toolName: 'loyalty.redeem-reward',
    inputSchema: RedeemRewardInput,
    outputSchema: RedeemRewardOutput,
    handler: redeemReward,
  },
];

/**
 * Default export
 */
export default loyaltyTools;



