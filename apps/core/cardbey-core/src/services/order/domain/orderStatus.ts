export const ORDER_STATUSES = [
  'pending',
  'confirmed',
  'preparing',
  'ready',
  'delivering',
  'completed',
  'cancel_requested',
  'cancelled',
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_CANCEL_REQUEST_STATUSES = [
  'pending',
  'accepted',
  'denied',
] as const;

export type OrderCancelRequestStatus = (typeof ORDER_CANCEL_REQUEST_STATUSES)[number];

export const ORDER_CHANNELS = ['store', 'food', 'pos'] as const;

export type OrderChannel = (typeof ORDER_CHANNELS)[number];

