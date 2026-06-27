/**
 * Runtime action registry — all commercial tools (never UI services).
 */

import { BUSINESS_ACTIONS } from './constants.js';

/** @type {Record<string, { category: string, requiresConfirmation: boolean, phase: number, description: string }>} */
export const BUSINESS_ACTION_REGISTRY = Object.freeze({
  create_order: {
    category: 'business',
    requiresConfirmation: false,
    phase: 1,
    description: 'Create a draft POS order with line items',
  },
  update_order: {
    category: 'business',
    requiresConfirmation: false,
    phase: 2,
    description: 'Update an open POS order',
  },
  cancel_order: {
    category: 'business',
    requiresConfirmation: true,
    phase: 1,
    description: 'Cancel a non-completed POS order',
  },
  checkout_order: {
    category: 'business',
    requiresConfirmation: true,
    phase: 1,
    description: 'Complete checkout: payment, receipt, inventory sale movements',
  },
  receive_inventory: {
    category: 'business',
    requiresConfirmation: false,
    phase: 1,
    description: 'Record inventory received (purchase movement)',
  },
  adjust_inventory: {
    category: 'business',
    requiresConfirmation: true,
    phase: 1,
    description: 'Record inventory adjustment movement',
  },
  transfer_inventory: {
    category: 'business',
    requiresConfirmation: true,
    phase: 2,
    description: 'Transfer stock between warehouses',
  },
  refund_order: {
    category: 'business',
    requiresConfirmation: true,
    phase: 2,
    description: 'Issue refund for a completed order',
  },
  close_shift: {
    category: 'business',
    requiresConfirmation: true,
    phase: 2,
    description: 'Close staff shift and cash drawer',
  },
  open_shift: {
    category: 'business',
    requiresConfirmation: false,
    phase: 2,
    description: 'Open staff shift and cash drawer',
  },
  create_supplier: {
    category: 'business',
    requiresConfirmation: false,
    phase: 2,
    description: 'Create supplier record',
  },
  create_purchase_order: {
    category: 'business',
    requiresConfirmation: false,
    phase: 2,
    description: 'Create purchase order draft',
  },
  receive_purchase_order: {
    category: 'business',
    requiresConfirmation: true,
    phase: 2,
    description: 'Receive goods against purchase order',
  },
  print_receipt: {
    category: 'business',
    requiresConfirmation: false,
    phase: 1,
    description: 'Mark receipt as printed and emit event',
  },
  apply_discount: {
    category: 'business',
    requiresConfirmation: true,
    phase: 2,
    description: 'Apply discount to order line or order',
  },
  apply_tax: {
    category: 'business',
    requiresConfirmation: false,
    phase: 2,
    description: 'Apply tax profile to order',
  },
  assign_table: {
    category: 'business',
    requiresConfirmation: false,
    phase: 2,
    description: 'Assign table to order',
  },
  move_table: {
    category: 'business',
    requiresConfirmation: false,
    phase: 2,
    description: 'Move order to another table',
  },
  merge_order: {
    category: 'business',
    requiresConfirmation: true,
    phase: 2,
    description: 'Merge two open orders',
  },
  split_bill: {
    category: 'business',
    requiresConfirmation: true,
    phase: 2,
    description: 'Split order into separate bills',
  },
  record_payment: {
    category: 'business',
    requiresConfirmation: true,
    phase: 1,
    description: 'Record payment against an order',
  },
});

export function isBusinessAction(toolName) {
  return BUSINESS_ACTIONS.includes(toolName);
}

export function getBusinessActionMeta(toolName) {
  return BUSINESS_ACTION_REGISTRY[toolName] ?? null;
}

export function listBusinessActions({ phase } = {}) {
  return Object.entries(BUSINESS_ACTION_REGISTRY)
    .filter(([, meta]) => (phase == null ? true : meta.phase <= phase))
    .map(([name, meta]) => ({ name, ...meta }));
}
