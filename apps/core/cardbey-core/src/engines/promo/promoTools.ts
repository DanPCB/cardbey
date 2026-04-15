/**
 * Promo Engine Tools
 * Tool definitions for orchestrator integration
 */

import {
  configurePromo,
  generatePromoAssets,
  queryActivePromos,
  redeemPromo,
  evaluateForOrder,
} from './index.ts';

import {
  ConfigurePromoInput,
  ConfigurePromoOutput,
  GeneratePromoAssetsInput,
  GeneratePromoAssetsOutput,
  QueryActivePromosInput,
  QueryActivePromosOutput,
  RedeemPromoInput,
  RedeemPromoOutput,
  EvaluateForOrderInput,
  EvaluateForOrderOutput,
} from './types.ts';

/**
 * Tool definition interface
 */
export interface ToolDefinition {
  engineId: string;
  toolName: string;
  inputSchema: unknown; // Zod schema
  outputSchema: unknown; // Zod schema
  handler: (input: unknown, ctx?: unknown) => Promise<unknown>;
}

/**
 * Promo Engine Tools Registry
 * Array of tool definitions for orchestrator integration
 */
export const promoTools: ToolDefinition[] = [
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
  {
    engineId: 'promo',
    toolName: 'promo.evaluate-for-order',
    inputSchema: EvaluateForOrderInput,
    outputSchema: EvaluateForOrderOutput,
    handler: evaluateForOrder,
  },
];

/**
 * Default export
 */
export default promoTools;
