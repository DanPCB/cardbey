import type { OrderCommandResult, OrderMutationInput } from '../contracts';
import { canBuyerRequestCancel, getAllowedActions } from '../../domain/orderPolicies';
import { canTransitionOrder } from '../../domain/orderTransitions';
import { readOrderById, createOrderCancelRequest, createOrderStatusEvent, updateOrderById } from '../../infrastructure/orderQueryRepository';

export async function requestOrderCancel(input: OrderMutationInput): Promise<OrderCommandResult> {
  const order = await readOrderById(input.orderId);
  if (!order) {
    return { ok: false, code: 'not_found', message: 'Order not found', order: null };
  }
  if (order.buyerUserId !== input.actor.actorId || input.actor.actorRole !== 'buyer') {
    return { ok: false, code: 'forbidden', message: 'Buyer ownership or role mismatch', order: null };
  }
  if (!canBuyerRequestCancel(order)) {
    return { ok: false, code: 'invalid_state', message: 'Order cannot be cancelled in its current state', order };
  }
  if (!canTransitionOrder(order.status, 'cancel_requested')) {
    return { ok: false, code: 'invalid_transition', message: 'Cancel request transition is not allowed', order };
  }

  const cancelRequest = await createOrderCancelRequest({
    orderId: order.id,
    requestedByUserId: input.actor.actorId,
    reason: input.reason ?? null,
    status: 'pending',
    reviewedByUserId: null,
    reviewNote: null,
    createdAt: new Date().toISOString(),
    reviewedAt: null,
  });

  const updatedOrder = await updateOrderById(order.id, { status: 'cancel_requested' });
  const event = await createOrderStatusEvent({
    orderId: order.id,
    fromStatus: order.status,
    toStatus: 'cancel_requested',
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
    message: 'Cancel request created',
    order: updatedOrder,
    eventId: event?.id ?? null,
    cancelRequestId: cancelRequest?.id ?? null,
    allowedActions: getAllowedActions(updatedOrder, input.actor),
  };
}

