import type { OrderDetail, ReadOrderByIdInput } from '../contracts';
import { readOrderById } from '../../infrastructure/orderQueryRepository';
import { getAllowedActions } from '../../domain/orderPolicies';
import { ORDER_TRANSITIONS } from '../../domain/orderTransitions';

export async function readSellerOrder(input: ReadOrderByIdInput): Promise<OrderDetail | null> {
  const order = await readOrderById(input.orderId);
  if (!order) return null;
  if (order.sellerUserId !== input.actor.actorId && order.sellerStoreId !== input.actor.actorId) return null;
  const allowedActions = getAllowedActions(order, input.actor);
  return {
    ...order,
    items: order.items ?? [],
    cancelRequest: order.cancelRequest ?? null,
    statusHistory: order.statusEvents ?? [],
    allowedActions,
    allowedNextStatuses: (ORDER_TRANSITIONS[order.status] ?? []) as any,
  } as OrderDetail;
}

