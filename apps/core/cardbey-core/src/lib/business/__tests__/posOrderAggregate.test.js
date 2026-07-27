import { describe, it, expect, vi } from 'vitest';
import { createPosOrder, checkoutPosOrder } from '../posOrderAggregate.js';
import { POS_ORDER_STATUS } from '../constants.js';

describe('posOrderAggregate', () => {
  it('creates order with line items and event', async () => {
    const orders = [];
    const events = [];
    const prisma = {
      posOrder: {
        create: vi.fn(async ({ data, include }) => {
          const order = {
            id: 'ord-1',
            ...data,
            items: data.items?.create ?? [],
          };
          orders.push(order);
          return order;
        }),
        update: vi.fn(async ({ where, data }) => {
          const o = orders.find((x) => x.id === where.id);
          Object.assign(o, data);
          return o;
        }),
        findFirst: vi.fn(),
      },
      businessEvent: {
        create: vi.fn(async ({ data }) => {
          const e = { id: `evt-${events.length}`, ...data };
          events.push(e);
          return e;
        }),
      },
    };

    const result = await createPosOrder(prisma, {
      storeId: 'store-1',
      items: [{ name: 'Coffee', quantity: 2, unitPrice: 4.5 }],
      actorUserId: 'user-1',
    });

    expect(result.id).toBe('ord-1');
    expect(result.subtotalAmount).toBe(9);
    expect(events.some((e) => e.eventType === 'OrderCreated')).toBe(true);
  });

  it('checkout completes order and records payment', async () => {
    const order = {
      id: 'ord-2',
      storeId: 'store-1',
      status: POS_ORDER_STATUS.DRAFT,
      totalAmount: 12,
      currency: 'AUD',
      items: [{ productId: 'p1', name: 'Tea', quantity: 1 }],
    };

    const prisma = {
      posOrder: {
        findFirst: vi.fn(async () => order),
        update: vi.fn(async ({ data }) => ({ ...order, ...data, items: order.items, payments: [], receipts: [] })),
      },
      payment: { create: vi.fn(async ({ data }) => ({ id: 'pay-1', ...data })) },
      receipt: { create: vi.fn(async ({ data }) => ({ id: 'rcp-1', ...data })) },
      inventoryItem: {
        findFirst: vi.fn(async () => null),
        create: vi.fn(async ({ data }) => ({ id: 'inv-1', ...data })),
      },
      inventoryMovement: {
        create: vi.fn(async ({ data }) => ({ id: 'mov-1', ...data })),
        aggregate: vi.fn(async () => ({ _sum: { quantityDelta: -1 } })),
      },
      businessEvent: {
        create: vi.fn(async ({ data }) => ({ id: 'evt-1', ...data })),
      },
    };

    const result = await checkoutPosOrder(prisma, {
      orderId: 'ord-2',
      storeId: 'store-1',
      paymentMethod: 'cash',
      actorUserId: 'user-1',
    });

    expect(result.payment.id).toBe('pay-1');
    expect(result.order.status).toBe(POS_ORDER_STATUS.COMPLETED);
    expect(prisma.inventoryMovement.create).toHaveBeenCalled();
  });
});
