/**
 * Business Operations Platform — runtime tool definitions (Phase 1).
 */

import { BUSINESS_ACTION_REGISTRY } from '../business/actionRegistry.js';

const baseParams = {
  storeId: { type: 'string', required: false },
  missionId: { type: 'string', required: false },
};

function def(toolName, extraParams = {}, extra = {}) {
  const meta = BUSINESS_ACTION_REGISTRY[toolName] ?? {};
  return {
    toolName,
    label: toolName.replace(/_/g, ' '),
    description: meta.description ?? `Business operation: ${toolName}`,
    category: 'business',
    targetTypes: ['store'],
    requiresConfirmation: Boolean(meta.requiresConfirmation),
    parameters: { ...baseParams, ...extraParams },
    ...extra,
  };
}

export const BUSINESS_TOOL_DEFINITIONS = [
  def('create_order', {
    items: { type: 'array', required: false },
    channel: { type: 'string', required: false },
    deliveryMethod: { type: 'string', required: false },
    tableId: { type: 'string', required: false },
    notes: { type: 'string', required: false },
  }),
  def('update_order', { orderId: { type: 'string', required: false } }),
  def('cancel_order', { orderId: { type: 'string', required: true }, reason: { type: 'string', required: false } }),
  def('checkout_order', {
    orderId: { type: 'string', required: true },
    paymentMethod: { type: 'string', required: false },
    paymentAmount: { type: 'number', required: false },
  }),
  def('receive_inventory', {
    productId: { type: 'string', required: false },
    variantId: { type: 'string', required: false },
    quantity: { type: 'number', required: true },
    name: { type: 'string', required: false },
    supplierId: { type: 'string', required: false },
  }),
  def('adjust_inventory', {
    inventoryItemId: { type: 'string', required: false },
    quantityDelta: { type: 'number', required: true },
    reason: { type: 'string', required: false },
  }),
  def('transfer_inventory', {
    inventoryItemId: { type: 'string', required: false },
    quantity: { type: 'number', required: false },
    fromWarehouseId: { type: 'string', required: false },
    toWarehouseId: { type: 'string', required: false },
  }),
  def('refund_order', { orderId: { type: 'string', required: true } }),
  def('close_shift', { shiftId: { type: 'string', required: false } }),
  def('open_shift', { staffId: { type: 'string', required: false }, openingFloat: { type: 'number', required: false } }),
  def('create_supplier', { name: { type: 'string', required: true } }),
  def('create_purchase_order', { supplierId: { type: 'string', required: false } }),
  def('receive_purchase_order', { purchaseOrderId: { type: 'string', required: true } }),
  def('print_receipt', { orderId: { type: 'string', required: true } }),
  def('apply_discount', { orderId: { type: 'string', required: true } }),
  def('apply_tax', { orderId: { type: 'string', required: true } }),
  def('assign_table', { orderId: { type: 'string', required: true }, tableId: { type: 'string', required: true } }),
  def('move_table', { orderId: { type: 'string', required: true }, tableId: { type: 'string', required: true } }),
  def('merge_order', { sourceOrderId: { type: 'string', required: true }, targetOrderId: { type: 'string', required: true } }),
  def('split_bill', { orderId: { type: 'string', required: true } }),
  def('record_payment', {
    orderId: { type: 'string', required: false },
    amount: { type: 'number', required: true },
    paymentMethod: { type: 'string', required: false },
  }),
];
