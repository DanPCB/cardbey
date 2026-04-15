/**
 * Promo Engine Tools
 * Tool definitions for orchestrator integration
 */

import {
  configurePromo,
  generatePromoAssets,
  queryActivePromos,
  redeemPromo,
} from './index.js';

import {
  ConfigurePromoInput,
  ConfigurePromoOutput,
  GeneratePromoAssetsInput,
  GeneratePromoAssetsOutput,
  QueryActivePromosInput,
  QueryActivePromosOutput,
  RedeemPromoInput,
  RedeemPromoOutput,
} from './types.js';

/**
 * Promo Engine Tools Registry
 * Array of tool definitions for orchestrator integration
 */
export const promoTools = [
  {
    engineId: 'promo',
    toolName: 'promo.configure',
    inputSchema: ConfigurePromoInput,
    outputSchema: ConfigurePromoOutput,
    handler: configurePromo,
  },
  {
    engineId: 'promo',
    toolName: 'promo.generate-assets',
    inputSchema: GeneratePromoAssetsInput,
    outputSchema: GeneratePromoAssetsOutput,
    handler: generatePromoAssets,
  },
  {
    engineId: 'promo',
    toolName: 'promo.query-active',
    inputSchema: QueryActivePromosInput,
    outputSchema: QueryActivePromosOutput,
    handler: queryActivePromos,
  },
  {
    engineId: 'promo',
    toolName: 'promo.redeem',
    inputSchema: RedeemPromoInput,
    outputSchema: RedeemPromoOutput,
    handler: redeemPromo,
  },
];

/**
 * Default export
 */
export default promoTools;



