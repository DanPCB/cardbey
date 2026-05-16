import { getOrderPrisma } from './orderRepository';

export async function browseOrders(where: Record<string, unknown>, skip: number, take: number) {
  const prisma = getOrderPrisma();
  const [items, totalItems] = await Promise.all([
    prisma.order.findMany({ where, skip, take, orderBy: { createdAt: 'desc' } }),
    prisma.order.count({ where }),
  ]);
  return { items, totalItems };
}

export async function readOrderById(orderId: string) {
  const prisma = getOrderPrisma();
  return prisma.order.findUnique({
    where: { id: orderId },
    include: {
      items: true,
      statusEvents: { orderBy: { createdAt: 'asc' } },
      cancelRequest: true,
    },
  });
}

export async function updateOrderById(orderId: string, data: Record<string, unknown>) {
  const prisma = getOrderPrisma();
  return prisma.order.update({
    where: { id: orderId },
    data,
  });
}

export async function createOrderStatusEvent(data: Record<string, unknown>) {
  const prisma = getOrderPrisma();
  return prisma.orderStatusEvent.create({ data });
}

export async function createOrderCancelRequest(data: Record<string, unknown>) {
  const prisma = getOrderPrisma();
  return prisma.orderCancelRequest.create({ data });
}

export async function updateOrderCancelRequest(where: Record<string, unknown>, data: Record<string, unknown>) {
  const prisma = getOrderPrisma();
  return prisma.orderCancelRequest.update({ where, data });
}

