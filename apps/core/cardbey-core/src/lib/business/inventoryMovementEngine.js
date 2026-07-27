/**
 * Inventory is history — current quantity is derived from movements.
 */

import { INVENTORY_MOVEMENT_TYPES, BUSINESS_EVENT_TYPES } from './constants.js';
import { appendBusinessEvent } from './businessEventService.js';

export { INVENTORY_MOVEMENT_TYPES };

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} inventoryItemId
 */
export async function calculateOnHandQuantity(prisma, inventoryItemId) {
  if (!prisma?.inventoryMovement?.aggregate) return 0;

  const result = await prisma.inventoryMovement.aggregate({
    where: { inventoryItemId },
    _sum: { quantityDelta: true },
  });

  return Number(result?._sum?.quantityDelta ?? 0);
}

/**
 * Record an inventory movement (never mutate quantity directly on InventoryItem).
 *
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {object} params
 */
export async function recordInventoryMovement(prisma, params) {
  const {
    storeId,
    inventoryItemId,
    movementType,
    quantityDelta,
    reason = null,
    sourceType = null,
    sourceId = null,
    destinationType = null,
    destinationId = null,
    referenceEntityType = null,
    referenceEntityId = null,
    runtimeExecutionId = null,
    missionId = null,
    actorUserId = null,
    metadata = null,
  } = params;

  if (!inventoryItemId || !movementType || quantityDelta == null || Number.isNaN(Number(quantityDelta))) {
    const err = new Error('inventoryItemId, movementType, and quantityDelta are required');
    err.code = 'INVALID_MOVEMENT';
    throw err;
  }

  if (!prisma?.inventoryMovement?.create) {
    const err = new Error('InventoryMovement table not available');
    err.code = 'SCHEMA_UNAVAILABLE';
    throw err;
  }

  const movement = await prisma.inventoryMovement.create({
    data: {
      storeId,
      inventoryItemId,
      movementType,
      quantityDelta: Number(quantityDelta),
      reason,
      sourceType,
      sourceId,
      destinationType,
      destinationId,
      referenceEntityType,
      referenceEntityId,
      runtimeExecutionId,
      missionId,
      actorUserId,
      metadata: metadata ?? undefined,
    },
  });

  const onHand = await calculateOnHandQuantity(prisma, inventoryItemId);

  let eventType = BUSINESS_EVENT_TYPES.INVENTORY_ADJUSTED;
  if (movementType === INVENTORY_MOVEMENT_TYPES.PURCHASE) {
    eventType = BUSINESS_EVENT_TYPES.INVENTORY_RECEIVED;
  } else if (movementType === INVENTORY_MOVEMENT_TYPES.TRANSFER) {
    eventType = BUSINESS_EVENT_TYPES.INVENTORY_TRANSFERRED;
  }

  const businessEvent = await appendBusinessEvent(prisma, {
    storeId,
    eventType,
    aggregateType: 'inventory_item',
    aggregateId: inventoryItemId,
    payload: {
      movementId: movement.id,
      movementType,
      quantityDelta: Number(quantityDelta),
      onHand,
      reason,
    },
    actorUserId,
    runtimeExecutionId,
    missionId,
  });

  const lowStockThreshold = Number(metadata?.lowStockThreshold ?? 0);
  if (lowStockThreshold > 0 && onHand <= lowStockThreshold) {
    await appendBusinessEvent(prisma, {
      storeId,
      eventType: BUSINESS_EVENT_TYPES.LOW_STOCK_DETECTED,
      aggregateType: 'inventory_item',
      aggregateId: inventoryItemId,
      payload: { onHand, lowStockThreshold },
      actorUserId,
      runtimeExecutionId,
      missionId,
    });
  }

  return { movement, onHand, businessEvent };
}

/**
 * Ensure an inventory item exists for a product/variant; create if missing.
 */
export async function ensureInventoryItem(prisma, { storeId, productId, variantId, name, sku, warehouseId }) {
  if (!prisma?.inventoryItem) {
    const err = new Error('InventoryItem table not available');
    err.code = 'SCHEMA_UNAVAILABLE';
    throw err;
  }

  const existing = await prisma.inventoryItem.findFirst({
    where: {
      storeId,
      ...(variantId ? { variantId } : {}),
      ...(productId && !variantId ? { productId } : {}),
      ...(sku ? { sku } : {}),
    },
  });

  if (existing) return existing;

  return prisma.inventoryItem.create({
    data: {
      storeId,
      productId: productId ?? null,
      variantId: variantId ?? null,
      warehouseId: warehouseId ?? null,
      sku: sku ?? null,
      name: name || 'Inventory item',
    },
  });
}
