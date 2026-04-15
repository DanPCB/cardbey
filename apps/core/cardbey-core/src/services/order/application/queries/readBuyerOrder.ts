import type { OrderDetail, ReadOrderByIdInput } from '../contracts';
import { readOrderById } from '../../infrastructure/orderQueryRepository';
import { getAllowedActions } from '../../domain/orderPolicies';
import { ORDER_TRANSITIONS } from '../../domain/orderTransitions';

export async function readBuyerOrder(input: ReadOrderByIdInput): Promise<OrderDetail | null> {
  const order = await readOrderById(input.orderId);
  if (!order) return null;
  if (order.buyerUserId !== input.actor.actorId) return null;
  return {
    ...order,
    items: order.items ?? [],
    cancelRequest: order.cancelRequest ?? null,
    statusHistory: order.statusEvents ?? [],
    allowedActions: getAllowedActions(order, input.actor),
    allowedNextStatuses: (ORDER_TRANSITIONS[order.status] ?? []) as any,
  } as OrderDetail;
}

