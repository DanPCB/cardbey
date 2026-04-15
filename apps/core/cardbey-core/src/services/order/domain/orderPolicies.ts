import type { OrderActorContext } from './orderRoles';
import type { Order } from './orderTypes';
import type { OrderStatus } from './orderStatus';
import { canTransitionOrder, ORDER_TRANSITIONS } from './orderTransitions';
import type { OrderAllowedAction } from '../../application/contracts';

export function canBuyerRequestCancel(order: Order): boolean {
  return !['completed', 'cancelled'].includes(order.status);
}

export function canSellerCancel(order: Order): boolean {
  return !['completed', 'cancelled'].includes(order.status);
}

export function canSellerAcceptCancel(order: Order): boolean {
  return order.status === 'cancel_requested';
}

export function canSellerDenyCancel(order: Order): boolean {
  return order.status === 'cancel_requested';
}

export function canSellerChangeStatus(order: Order, nextStatus: OrderStatus): boolean {
  return canTransitionOrder(order.status, nextStatus);
}

export function getAllowedActions(order: Order, actorContext: OrderActorContext): OrderAllowedAction[] {
  const actions: OrderAllowedAction[] = [];
  if (actorContext.actorRole === 'buyer' && canBuyerRequestCancel(order)) actions.push('request_cancel');
  if (actorContext.actorRole === 'seller' && canSellerCancel(order)) actions.push('seller_cancel');
  if (actorContext.actorRole === 'seller' && canSellerAcceptCancel(order)) actions.push('accept_cancel');
  if (actorContext.actorRole === 'seller' && canSellerDenyCancel(order)) actions.push('deny_cancel');
  if (actorContext.actorRole === 'seller') {
    actions.push('change_status');
  }
  return actions;
}

