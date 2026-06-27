import { executeBusinessTool } from './_shared.js';
import { INVENTORY_MOVEMENT_TYPES, recordInventoryMovement, ensureInventoryItem } from '../../business/inventoryMovementEngine.js';

export async function execute(input = {}, context = {}) {
  return executeBusinessTool({
    toolName: 'receive_inventory',
    input,
    context,
    handler: async ({ prisma, input: inp, governance }) => {
      const quantity = Number(inp.quantity);
      if (!quantity || quantity <= 0) {
        const err = new Error('positive quantity is required');
        err.code = 'INVALID_QUANTITY';
        throw err;
      }

      const invItem = await ensureInventoryItem(prisma, {
        storeId: governance.storeId,
        productId: inp.productId ?? null,
        variantId: inp.variantId ?? null,
        name: inp.name ?? 'Received stock',
        sku: inp.sku ?? null,
        warehouseId: inp.warehouseId ?? null,
      });

      const movement = await recordInventoryMovement(prisma, {
        storeId: governance.storeId,
        inventoryItemId: invItem.id,
        movementType: INVENTORY_MOVEMENT_TYPES.PURCHASE,
        quantityDelta: quantity,
        reason: inp.reason ?? 'inventory_received',
        sourceType: inp.sourceType ?? 'supplier',
        sourceId: inp.supplierId ?? inp.sourceId ?? null,
        referenceEntityType: inp.referenceEntityType ?? null,
        referenceEntityId: inp.referenceEntityId ?? null,
        runtimeExecutionId: governance.runtimeExecutionId,
        missionId: governance.missionId,
        actorUserId: governance.userId,
        metadata: inp.metadata ?? null,
      });

      return {
        inventoryItemId: invItem.id,
        movementId: movement.movement.id,
        onHand: movement.onHand,
        businessEventId: movement.businessEvent?.id,
      };
    },
  });
}

export default execute;
