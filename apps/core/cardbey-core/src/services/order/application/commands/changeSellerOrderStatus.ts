import type { ChangeSellerOrderStatusInput, OrderCommandResult } from '../contracts';
import { canSellerChangeStatus, getAllowedActions } from '../../domain/orderPolicies';
import { readOrderById, updateOrderById, createOrderStatusEvent } from '../../infrastructure/orderQueryRepository';
import { canTransitionOrder } from '../../domain/orderTransitions';

export async function changeSellerOrderStatus(input: ChangeSellerOrderStatusInput): Promise<OrderCommandResult> {
  const order = await readOrderById(input.orderId);
  if (!order) {
    return { ok: false, code: 'not_found', message: 'Order not found', order: null };
  }
  if (input.actor.actorRole !== 'seller') {
    return { ok: false, code: 'forbidden', message: 'Only sellers can change order status', order: null };
  }
  if (!canSellerChangeStatus(order, input.nextStatus)) {
    return { ok: false, code: 'invalid_transition', message: 'Requested status transition is not allowed', order };
  }
  if (!canTransitionOrder(order.status, input.nextStatus)) {
    return { ok: false, code: 'invalid_transition', message: 'Transition failed policy validation', order };
  }
  const updatedOrder = await updateOrderById(order.id, { status: input.nextStatus });
  const event = await createOrderStatusEvent({
    orderId: order.id,
    fromStatus: order.status,
    toStatus: input.nextStatus,
    actorId: input.actor.actorId,
    actorType: input.actor.actorType,
    actorRole: input.actor.actorRole,
    source: input.actor.source,
    reason: input.reason ?? null,
    createdAt: new Date().toISOString(),
  });
  return {
    ok: true,
    code: 'ok',
    message: 'Order status updated',
    order: updatedOrder,
    eventId: event?.id ?? null,
    allowedActions: getAllowedActions(updatedOrder, input.actor),
  };
}

