/**
 * Payment domain types and constants.
 */

export const PAYMENT_PURPOSES = Object.freeze([
  'booking_payment',
  'inspection_fee',
  'consultation_fee',
  'order_payment',
  'deposit',
  'quote_acceptance_deposit',
]);

export const PAYMENT_STATUSES = Object.freeze({
  PENDING: 'pending',
  PROCESSING: 'processing',
  SUCCEEDED: 'succeeded',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
  REFUNDED: 'refunded',
});

export const LINKED_ENTITY_TYPES = Object.freeze([
  'booking',
  'quote_request',
  'pos_order',
  'journey',
]);

export const STRIPE_PAYMENT_METHOD = 'stripe';
