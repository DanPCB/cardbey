import type { OrderStatusEvent } from './orderTypes';

export type OrderEventType =
  | 'order.created'
  | 'order.status_changed'
  | 'order.cancel_requested'
  | 'order.cancel_accepted'
  | 'order.cancel_denied'
  | 'order.cancelled';

export interface OrderDomainEvent {
  type: OrderEventType;
  payload: OrderStatusEvent & { orderId: string };
}

