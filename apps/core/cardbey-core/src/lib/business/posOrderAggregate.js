/**
 * POS Order aggregate — Order → Line Items → Payments → Receipts → Inventory Movements → Events.
 * Never write inventory directly from checkout; movements are recorded via inventoryMovementEngine.
 */

import { POS_ORDER_STATUS, INVENTORY_MOVEMENT_TYPES, BUSINESS_EVENT_TYPES } from './constants.js';
import { appendBusinessEvent } from './businessEventService.js';
import { recordInventoryMovement, ensureInventoryItem } from './inventoryMovementEngine.js';
import { recordPayment } from './paymentService.js';

function lineTotal(item) {
  const qty = Number(item.quantity ?? 1);
  const unit = Number(item.unitPrice ?? 0);
  const discount = Number(item.discountAmount ?? 0);
  const tax = Number(item.taxAmount ?? 0);
  return Math.max(0, qty * unit - discount + tax);
}

function orderNumberFromId(id) {
  return `ORD-${String(id).slice(-8).toUpperCase()}`;
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {object} params
 */
export async function createPosOrder(prisma, params) {
  const {
    storeId,
    channel = 'pos',
    deliveryMethod = null,
    tableId = null,
    customerId = null,
    staffId = null,
    shiftId = null,
    notes = null,
    items = [],
    currency = 'AUD',
    runtimeExecutionId = null,
    missionId = null,
    actorUserId = null,
  } = params;

  if (!prisma?.posOrder?.create) {
    const err = new Error('PosOrder table not available');
    err.code = 'SCHEMA_UNAVAILABLE';
    throw err;
  }

  const lineRows = (Array.isArray(items) ? items : []).map((item) => {
    const quantity = Number(item.quantity ?? 1);
    const unitPrice = Number(item.unitPrice ?? item.price ?? 0);
    const discountAmount = Number(item.discountAmount ?? 0);
    const taxAmount = Number(item.taxAmount ?? 0);
    const row = {
      productId: item.productId ?? null,
      variantId: item.variantId ?? null,
      name: String(item.name ?? 'Item'),
      quantity,
      unitPrice,
      discountAmount,
      taxAmount,
      lineTotal: lineTotal({ quantity, unitPrice, discountAmount, taxAmount }),
      optionInfo: item.optionInfo ?? undefined,
      metadata: item.metadata ?? undefined,
    };
    return row;
  });

  const subtotalAmount = lineRows.reduce((sum, r) => sum + r.lineTotal, 0);

  const order = await prisma.posOrder.create({
    data: {
      storeId,
      status: POS_ORDER_STATUS.DRAFT,
      channel,
      deliveryMethod,
      tableId,
      customerId,
      staffId,
      shiftId,
      subtotalAmount,
      taxAmount: lineRows.reduce((s, r) => s + r.taxAmount, 0),
      discountAmount: lineRows.reduce((s, r) => s + r.discountAmount, 0),
      totalAmount: subtotalAmount,
      currency,
      notes,
      runtimeExecutionId,
      missionId,
      items: lineRows.length ? { create: lineRows } : undefined,
    },
    include: { items: true },
  });

  await prisma.posOrder.update({
    where: { id: order.id },
    data: { orderNumber: orderNumberFromId(order.id) },
  });

  const businessEvent = await appendBusinessEvent(prisma, {
    storeId,
    eventType: BUSINESS_EVENT_TYPES.ORDER_CREATED,
    aggregateType: 'pos_order',
    aggregateId: order.id,
    payload: {
      orderNumber: orderNumberFromId(order.id),
      itemCount: lineRows.length,
      totalAmount: subtotalAmount,
      channel,
    },
    actorUserId,
    runtimeExecutionId,
    missionId,
  });

  return { ...order, orderNumber: orderNumberFromId(order.id), businessEvent };
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {object} params
 */
export async function checkoutPosOrder(prisma, params) {
  const {
    orderId,
    storeId,
    paymentMethod = 'cash',
    paymentAmount = null,
    deductInventory = true,
    runtimeExecutionId = null,
    missionId = null,
    actorUserId = null,
  } = params;

  const order = await prisma.posOrder.findFirst({
    where: { id: orderId, storeId },
    include: { items: true },
  });

  if (!order) {
    const err = new Error('Order not found');
    err.code = 'ORDER_NOT_FOUND';
    throw err;
  }

  if (order.status === POS_ORDER_STATUS.COMPLETED) {
    const err = new Error('Order already completed');
    err.code = 'ORDER_ALREADY_COMPLETED';
    throw err;
  }

  if (order.status === POS_ORDER_STATUS.CANCELLED) {
    const err = new Error('Order is cancelled');
    err.code = 'ORDER_CANCELLED';
    throw err;
  }

  const amount = paymentAmount != null ? Number(paymentAmount) : Number(order.totalAmount);

  const { payment, businessEvent: paymentEvent } = await recordPayment(prisma, {
    storeId,
    posOrderId: order.id,
    method: paymentMethod,
    amount,
    currency: order.currency,
    runtimeExecutionId,
    missionId,
    actorUserId,
  });

  const inventoryMovements = [];
  if (deductInventory && order.items?.length) {
    for (const line of order.items) {
      if (!line.productId && !line.variantId) continue;
      const invItem = await ensureInventoryItem(prisma, {
        storeId,
        productId: line.productId,
        variantId: line.variantId,
        name: line.name,
      });
      const movement = await recordInventoryMovement(prisma, {
        storeId,
        inventoryItemId: invItem.id,
        movementType: INVENTORY_MOVEMENT_TYPES.SALE,
        quantityDelta: -Math.abs(Number(line.quantity)),
        reason: 'pos_sale',
        referenceEntityType: 'pos_order',
        referenceEntityId: order.id,
        runtimeExecutionId,
        missionId,
        actorUserId,
      });
      inventoryMovements.push(movement);
    }
  }

  const receipt = prisma?.receipt?.create
    ? await prisma.receipt.create({
        data: {
          storeId,
          posOrderId: order.id,
          receiptNumber: `RCP-${order.orderNumber ?? order.id.slice(-6)}`,
          payload: {
            orderId: order.id,
            items: order.items,
            totalAmount: order.totalAmount,
            paymentId: payment.id,
          },
          runtimeExecutionId,
        },
      })
    : null;

  const completed = await prisma.posOrder.update({
    where: { id: order.id },
    data: {
      status: POS_ORDER_STATUS.COMPLETED,
      completedAt: new Date(),
    },
    include: { items: true, payments: true, receipts: true },
  });

  const businessEvent = await appendBusinessEvent(prisma, {
    storeId,
    eventType: BUSINESS_EVENT_TYPES.ORDER_COMPLETED,
    aggregateType: 'pos_order',
    aggregateId: order.id,
    payload: {
      paymentId: payment.id,
      receiptId: receipt?.id ?? null,
      inventoryMovementCount: inventoryMovements.length,
      totalAmount: amount,
    },
    actorUserId,
    runtimeExecutionId,
    missionId,
  });

  return {
    order: completed,
    payment,
    paymentEvent,
    receipt,
    inventoryMovements,
    businessEvent,
  };
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {object} params
 */
export async function cancelPosOrder(prisma, params) {
  const { orderId, storeId, reason = null, runtimeExecutionId, missionId, actorUserId } = params;

  const order = await prisma.posOrder.findFirst({ where: { id: orderId, storeId } });
  if (!order) {
    const err = new Error('Order not found');
    err.code = 'ORDER_NOT_FOUND';
    throw err;
  }

  if (order.status === POS_ORDER_STATUS.COMPLETED) {
    const err = new Error('Cannot cancel completed order — use refund_order');
    err.code = 'ORDER_COMPLETED';
    throw err;
  }

  const updated = await prisma.posOrder.update({
    where: { id: orderId },
    data: { status: POS_ORDER_STATUS.CANCELLED },
  });

  const businessEvent = await appendBusinessEvent(prisma, {
    storeId,
    eventType: BUSINESS_EVENT_TYPES.ORDER_CANCELLED,
    aggregateType: 'pos_order',
    aggregateId: orderId,
    payload: { reason },
    actorUserId,
    runtimeExecutionId,
    missionId,
  });

  return { order: updated, businessEvent };
}
