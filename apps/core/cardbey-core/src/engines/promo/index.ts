/**
 * Promo Engine v1
 * Main entry point for promo engine exports
 */

// Re-export types
export * from './types.ts';

// Re-export events
export * from './events.ts';

// Re-export tool functions
export { configurePromo } from './configurePromo.ts';
export { generatePromoAssets } from './generatePromoAssets.ts';
export { queryActivePromos } from './queryActivePromos.ts';
export { redeemPromo } from './redeemPromo.ts';
export { evaluateForOrder } from './evaluateForOrder.ts';

// Re-export tool definitions for orchestrator
export { promoTools } from './promoTools.ts';

// Re-export EngineContext type
export type { EngineContext } from './configurePromo.ts';

// Default export
export { promoTools as default } from './promoTools.ts';
