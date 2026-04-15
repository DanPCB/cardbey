import type { OrderSummary, OrderSummaryInput } from '../contracts';
import { getOrderPrisma } from '../../infrastructure/orderRepository';

export async function readOrderSummary(input: OrderSummaryInput): Promise<OrderSummary> {
  const prisma = getOrderPrisma();
  const where: Record<string, unknown> = {
    ...(input.sellerUserId ? { sellerUserId: input.sellerUserId } : {}),
    ...(input.buyerUserId ? { buyerUserId: input.buyerUserId } : {}),
    ...(input.channel ? { channel: input.channel } : {}),
    ...(input.from || input.to ? { createdAt: {} } : {}),
  };
  const orders = await prisma.order.findMany({ where });
  const totalOrders = orders.length;
  const completedOrders = orders.filter((order: any) => order.status === 'completed').length;
  const cancelledOrders = orders.filter((order: any) => order.status === 'cancelled').length;
  const openOrders = orders.filter((order: any) => !['completed', 'cancelled'].includes(order.status)).length;
  const totalRevenue = orders.reduce((sum: number, order: any) => sum + Number(order.totalAmount ?? 0), 0);
  return {
    totalOrders,
    openOrders,
    completedOrders,
    cancelledOrders,
    totalRevenue,
    currency: orders[0]?.currency ?? null,
  };
}

