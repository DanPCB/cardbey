/**
 * Business Operations — governed commercial runtime skill (Phase 1 foundation).
 * POS = Point of Business Operations. All writes go through runtime tools.
 */

import { skillRegistry } from '../SkillRegistry.js';

/** @type {import('../types.js').SkillDefinition} */
export const BusinessOperationsSkill = {
  name: 'business_operations',
  version: '1.0',
  description:
    'Governed store operations: orders, inventory, payments, receipts. All commercial writes execute through runtime authority.',
  triggers: [
    'sell',
    'create_order',
    'checkout',
    'checkout_order',
    'receive_inventory',
    'adjust_inventory',
    'stock',
    'inventory',
    'low_stock',
    'refund',
    'print_receipt',
    'close_register',
    'close_shift',
    'open_shift',
    'purchase_order',
    'supplier',
    'pos',
    'point_of_sale',
    'business_operations',
  ],
  requiredContext: ['storeId', 'userId'],
  observable: true,
  composes: ['catalog', 'booking'],
  steps: [
    {
      id: 'resolve_business_intent',
      name: 'Resolve business intent',
      tool: 'create_order',
      required: false,
      condition: (ctx) =>
        /sell|create.*order|two coffees|order now/i.test(String(ctx.toolInput?.prompt ?? ctx.query ?? '')),
      buildInput: (ctx) => ({
        storeId: ctx.storeId,
        items: ctx.toolInput?.items ?? [],
        notes: ctx.toolInput?.notes ?? null,
      }),
    },
    {
      id: 'receive_stock',
      name: 'Receive inventory',
      tool: 'receive_inventory',
      required: false,
      condition: (ctx) =>
        /receive.*(delivery|stock|inventory)|milk delivery|goods received/i.test(
          String(ctx.toolInput?.prompt ?? ctx.query ?? ''),
        ),
      buildInput: (ctx) => ({
        storeId: ctx.storeId,
        quantity: ctx.toolInput?.quantity,
        productId: ctx.toolInput?.productId,
        name: ctx.toolInput?.name,
      }),
    },
    {
      id: 'checkout',
      name: 'Checkout order',
      tool: 'checkout_order',
      required: false,
      condition: (ctx) =>
        Boolean(ctx.toolInput?.orderId) &&
        /checkout|complete.*order|take payment/i.test(String(ctx.toolInput?.prompt ?? ctx.query ?? '')),
      buildInput: (ctx) => ({
        storeId: ctx.storeId,
        orderId: ctx.toolInput?.orderId,
        paymentMethod: ctx.toolInput?.paymentMethod ?? 'cash',
      }),
    },
    {
      id: 'print_receipt_step',
      name: 'Print receipt',
      tool: 'print_receipt',
      required: false,
      condition: (ctx) =>
        Boolean(ctx.toolInput?.orderId) && /print.*receipt/i.test(String(ctx.toolInput?.prompt ?? ctx.query ?? '')),
      buildInput: (ctx) => ({
        storeId: ctx.storeId,
        orderId: ctx.toolInput?.orderId,
      }),
    },
  ],
};

if (!skillRegistry.has(BusinessOperationsSkill.name)) {
  skillRegistry.register(BusinessOperationsSkill);
}
