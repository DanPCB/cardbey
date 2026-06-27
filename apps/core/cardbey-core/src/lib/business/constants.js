/**
 * Business Operations Platform — domain constants (Phase 1).
 * Store = Business (storeId → Business.id).
 */

export const INVENTORY_MOVEMENT_TYPES = Object.freeze({
  PURCHASE: 'Purchase',
  SALE: 'Sale',
  RETURN: 'Return',
  WASTE: 'Waste',
  ADJUSTMENT: 'Adjustment',
  TRANSFER: 'Transfer',
  PRODUCTION: 'Production',
  CONSUMPTION: 'Consumption',
  CORRECTION: 'Correction',
});

export const BUSINESS_EVENT_TYPES = Object.freeze({
  INVENTORY_RECEIVED: 'InventoryReceived',
  INVENTORY_ADJUSTED: 'InventoryAdjusted',
  INVENTORY_TRANSFERRED: 'InventoryTransferred',
  ORDER_CREATED: 'OrderCreated',
  ORDER_UPDATED: 'OrderUpdated',
  ORDER_COMPLETED: 'OrderCompleted',
  ORDER_CANCELLED: 'OrderCancelled',
  PAYMENT_RECEIVED: 'PaymentReceived',
  REFUND_ISSUED: 'RefundIssued',
  RECEIPT_PRINTED: 'ReceiptPrinted',
  CUSTOMER_CREATED: 'CustomerCreated',
  PROMOTION_APPLIED: 'PromotionApplied',
  LOYALTY_EARNED: 'LoyaltyEarned',
  LOW_STOCK_DETECTED: 'LowStockDetected',
  SHIFT_OPENED: 'ShiftOpened',
  SHIFT_CLOSED: 'ShiftClosed',
  SUPPLIER_CREATED: 'SupplierCreated',
  PURCHASE_ORDER_CREATED: 'PurchaseOrderCreated',
  PURCHASE_ORDER_RECEIVED: 'PurchaseOrderReceived',
});

export const POS_ORDER_STATUS = Object.freeze({
  DRAFT: 'draft',
  OPEN: 'open',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  REFUNDED: 'refunded',
});

export const PAYMENT_METHODS = Object.freeze({
  CASH: 'cash',
  CARD: 'card',
  TRANSFER: 'transfer',
  OTHER: 'other',
});

export const PAYMENT_STATUS = Object.freeze({
  PENDING: 'pending',
  CAPTURED: 'captured',
  FAILED: 'failed',
  REFUNDED: 'refunded',
});

export const BUSINESS_ACTIONS = Object.freeze([
  'create_order',
  'update_order',
  'cancel_order',
  'checkout_order',
  'receive_inventory',
  'adjust_inventory',
  'transfer_inventory',
  'refund_order',
  'close_shift',
  'open_shift',
  'create_supplier',
  'create_purchase_order',
  'receive_purchase_order',
  'print_receipt',
  'apply_discount',
  'apply_tax',
  'assign_table',
  'move_table',
  'merge_order',
  'split_bill',
  'record_payment',
]);
