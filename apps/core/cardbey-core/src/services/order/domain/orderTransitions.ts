import type { OrderStatus } from './orderStatus';

export const ORDER_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  pending: ['confirmed', 'cancel_requested', 'cancelled'],
  confirmed: ['preparing', 'cancel_requested', 'cancelled'],
  preparing: ['ready', 'cancel_requested'],
  ready: ['delivering', 'completed'],
  delivering: ['completed'],
  completed: [],
  cancel_requested: ['cancelled', 'confirmed'],
  cancelled: [],
} as const;

export function canTransitionOrder(fromStatus: OrderStatus, toStatus: OrderStatus): boolean {
  return ORDER_TRANSITIONS[fromStatus]?.includes(toStatus) ?? false;
}

