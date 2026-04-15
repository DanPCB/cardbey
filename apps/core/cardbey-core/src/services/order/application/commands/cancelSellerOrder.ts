import type { OrderCommandResult, OrderMutationInput } from '../contracts';
import { canSellerCancel, getAllowedActions } from '../../domain/orderPolicies';
import { canTransitionOrder } from '../../domain/orderTransitions';
import { readOrderById, updateOrderById, createOrderStatusEvent } from '../../infrastructure/orderQueryRepository';

export async function cancelSellerOrder(input: OrderMutationInput): Promise<OrderCommandResult> {
  const order = await readOrderById(input.orderId);
  if (!order) {
    return { ok: false, code: 'not_found', message: 'Order not found', order: null };
  }
  if (input.actor.actorRole !== 'seller') {
    return { ok: false, code: 'forbidden', message: 'Only sellers can cancel orders', order: null };
  }
  if (!canSellerCancel(order)) {
    return { ok: false, code: 'invalid_state', message: 'Order cannot be cancelled in its current state', order };
  }
  if (!canTransitionOrder(order.status, 'cancelled')) {
    return { ok: false, code: 'invalid_transition', message: 'Seller cancel transition is not allowed', order };
  }
  const updatedOrder = await updateOrderById(order.id, { status: 'cancelled' });
  const event = await createOrderStatusEvent({
    orderId: order.id,
    fromStatus: order.status,
    toStatus: 'cancelled',
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
    message: 'Order cancelled',
    order: updatedOrder,
    eventId: event?.id ?? null,
    allowedActions: getAllowedActions(updatedOrder, input.actor),
  };
}

