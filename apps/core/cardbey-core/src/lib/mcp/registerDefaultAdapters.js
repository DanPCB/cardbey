/**
 * Side-effect: register built-in MCP adapters at process load.
 * Loaded from `toolExecutors/index.js` so any path that resolves executors (including tests) has adapters.
 */

import { registerMcpAdapter } from './adapterRegistry.js';
import { invokeContextProducts } from './adapters/contextProductsAdapter.js';
import { invokeContextBusiness } from './adapters/contextBusinessAdapter.js';
import { invokeContextStoreAssets } from './adapters/contextStoreAssetsAdapter.js';
import { invokeContextPromotions } from './adapters/promotionsContextAdapter.js';
import { invokeContextMissions } from './adapters/missionsContextAdapter.js';
import { invokeContextAnalytics } from './adapters/analyticsContextAdapter.js';

registerMcpAdapter('mcp_context_products', {
  id: 'mcp_context_products',
  description: 'Read-only published products for authenticated user (aligned with GET /mcp/resources/products)',
  invoke: async (args, envelope) => invokeContextProducts(args, envelope),
});

registerMcpAdapter('mcp_context_business', {
  id: 'mcp_context_business',
  description: 'Read-only business/store summaries and product counts for authenticated user (internal Prisma)',
  invoke: async (args, envelope) => invokeContextBusiness(args, envelope),
});

registerMcpAdapter('mcp_context_store_assets', {
  id: 'mcp_context_store_assets',
  description: 'Read-only store branding and asset URLs/metadata for authenticated user (internal Prisma)',
  invoke: async (args, envelope) => invokeContextStoreAssets(args, envelope),
});

registerMcpAdapter('mcp_context_promotions', {
  id: 'mcp_context_promotions',
  description: 'Read-only active/planned promotions for a store (user-owned business)',
  invoke: async (args, envelope) => invokeContextPromotions(args, envelope),
});

registerMcpAdapter('mcp_context_missions', {
  id: 'mcp_context_missions',
  description: 'Read-only recent MissionPipeline rows for user (optional store scope)',
  invoke: async (args, envelope) => invokeContextMissions(args, envelope),
});

registerMcpAdapter('mcp_context_analytics', {
  id: 'mcp_context_analytics',
  description: 'Read-only product/promotion/mission counts for a store',
  invoke: async (args, envelope) => invokeContextAnalytics(args, envelope),
});
