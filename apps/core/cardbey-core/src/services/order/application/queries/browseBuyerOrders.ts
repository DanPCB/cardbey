import type { BrowseBuyerOrdersInput, QueryPage, OrderListItem } from '../contracts';
import { browseOrders } from '../../infrastructure/orderQueryRepository';

export async function browseBuyerOrders(input: BrowseBuyerOrdersInput): Promise<QueryPage<OrderListItem>> {
  const page = Math.max(1, input.page ?? 1);
  const pageSize = Math.max(1, Math.min(100, input.pageSize ?? 20));
  const where: Record<string, unknown> = {
    buyerUserId: input.buyerUserId,
    ...(input.channel ? { channel: input.channel } : {}),
    ...(input.status ? { status: input.status } : {}),
  };
  const { items, totalItems } = await browseOrders(where, (page - 1) * pageSize, pageSize);
  return {
    items: items as OrderListItem[],
    totalItems,
    totalPages: Math.max(1, Math.ceil(totalItems / pageSize)),
    page,
    pageSize,
  };
}

