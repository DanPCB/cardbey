/**
 * Product catalog management — list, add, update, remove, pricing.
 * DANH: skill-round2-catalog
 */

import { skillRegistry } from '../SkillRegistry.js';

/** @type {import('../types.js').SkillDefinition} */
export const ProductCatalogSkill = {
  name: 'product_catalog',
  version: '1.0',
  description: 'Manage store products, categories, pricing, and availability.',
  triggers: [
    'product',
    'catalog',
    'catalogue',
    'add_product',
    'update_product',
    'remove_product',
    'product_catalog',
    'replace_catalog',
    'update_catalog',
    'product_price',
    'product_category',
  ],
  requiredContext: ['storeId', 'userId'],
  observable: true,
  steps: [
    {
      id: 'catalog_action',
      name: 'Manage product catalog',
      tool: 'manage_product_catalog',
      required: true,
      buildInput: (ctx) => ({
        storeId: ctx.storeId,
        action: ctx.toolInput?.action || ctx.toolInput?.subIntent || 'get_summary',
        name: ctx.toolInput?.name,
        description: ctx.toolInput?.description,
        price: ctx.toolInput?.price,
        category: ctx.toolInput?.category,
        productId: ctx.toolInput?.productId,
        updates: ctx.toolInput?.updates,
        limit: ctx.toolInput?.limit,
      }),
    },
  ],
  retryPolicy: {
    maxAttempts: 2,
    backoffMs: 1500,
    shouldRetry: (error) =>
      error?.code !== 'VALIDATION_ERROR' && error?.code !== 'PERMISSION_DENIED',
  },
};

if (!skillRegistry.has(ProductCatalogSkill.name)) {
  skillRegistry.register(ProductCatalogSkill);
}
