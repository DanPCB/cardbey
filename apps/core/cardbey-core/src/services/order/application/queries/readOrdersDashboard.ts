import type { OrdersDashboardInput, OrdersDashboard, OrderListItem } from '../contracts';
import { getOrderPrisma } from '../../infrastructure/orderRepository';

export async function readOrdersDashboard(input: OrdersDashboardInput): Promise<OrdersDashboard> {
  const prisma = getOrderPrisma();
  const where: Record<string, unknown> = {
    ...(input.sellerUserId ? { sellerUserId: input.sellerUserId } : {}),
    ...(input.buyerUserId ? { buyerUserId: input.buyerUserId } : {}),
    ...(input.channel ? { channel: input.channel } : {}),
  };
  const recentOrders = (await prisma.order.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 10,
  })) as OrderListItem[];
  const allOrders = await prisma.order.findMany({ where });
  const byStatus: Record<string, number> = {};
  const byChannel: Record<string, number> = {};
  for (const order of allOrders as any[]) {
    byStatus[order.status] = (byStatus[order.status] ?? 0) + 1;
    byChannel[order.channel] = (byChannel[order.channel] ?? 0) + 1;
  }
  return {
    byStatus,
    byChannel,
    recentOrders,
    summary: {
      totalOrders: allOrders.length,
      openOrders: allOrders.filter((order: any) => !['completed', 'cancelled'].includes(order.status)).length,
      completedOrders: allOrders.filter((order: any) => order.status === 'completed').length,
      cancelledOrders: allOrders.filter((order: any) => order.status === 'cancelled').length,
      totalRevenue: allOrders.reduce((sum: number, order: any) => sum + Number(order.totalAmount ?? 0), 0),
      currency: allOrders[0]?.currency ?? null,
    },
  };
}

