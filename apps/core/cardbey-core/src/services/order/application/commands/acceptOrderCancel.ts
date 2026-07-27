import type { OrderCommandResult, OrderMutationInput } from '../contracts';
import { canSellerAcceptCancel, getAllowedActions } from '../../domain/orderPolicies';
import { canTransitionOrder } from '../../domain/orderTransitions';
import { readOrderById, updateOrderById, updateOrderCancelRequest, createOrderStatusEvent } from '../../infrastructure/orderQueryRepository';

export async function acceptOrderCancel(input: OrderMutationInput): Promise<OrderCommandResult> {
  const order = await readOrderById(input.orderId);
  if (!order) {
    return { ok: false, code: 'not_found', message: 'Order not found', order: null };
  }
  if (input.actor.actorRole !== 'seller') {
    return { ok: false, code: 'forbidden', message: 'Only sellers can accept cancel requests', order: null };
  }
  if (!canSellerAcceptCancel(order)) {
    return { ok: false, code: 'invalid_state', message: 'No pending cancel request to accept', order };
  }
  if (!canTransitionOrder(order.status, 'cancelled')) {
    return { ok: false, code: 'invalid_transition', message: 'Accepting cancel cannot transition order to cancelled', order };
  }

  await updateOrderCancelRequest({ orderId: order.id }, {
    status: 'accepted',
    reviewedByUserId: input.actor.actorId,
    reviewNote: input.reason ?? null,
    reviewedAt: new Date().toISOString(),
  });
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
    message: 'Cancel request accepted',
    order: updatedOrder,
    eventId: event?.id ?? null,
    allowedActions: getAllowedActions(updatedOrder, input.actor),
  };
}

