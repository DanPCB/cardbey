import { executeBusinessTool } from './_shared.js';
import { INVENTORY_MOVEMENT_TYPES, recordInventoryMovement, ensureInventoryItem } from '../../business/inventoryMovementEngine.js';

export async function execute(input = {}, context = {}) {
  return executeBusinessTool({
    toolName: 'adjust_inventory',
    input,
    context,
    handler: async ({ prisma, input: inp, governance }) => {
      const quantityDelta = Number(inp.quantityDelta ?? inp.quantity);
      if (quantityDelta === 0 || Number.isNaN(quantityDelta)) {
        const err = new Error('non-zero quantityDelta is required');
        err.code = 'INVALID_QUANTITY';
        throw err;
      }

      let inventoryItemId = inp.inventoryItemId ?? null;
      if (!inventoryItemId) {
        const invItem = await ensureInventoryItem(prisma, {
          storeId: governance.storeId,
          productId: inp.productId ?? null,
          variantId: inp.variantId ?? null,
          name: inp.name ?? 'Adjusted item',
          sku: inp.sku ?? null,
          warehouseId: inp.warehouseId ?? null,
        });
        inventoryItemId = invItem.id;
      }

      const movement = await recordInventoryMovement(prisma, {
        storeId: governance.storeId,
        inventoryItemId,
        movementType: INVENTORY_MOVEMENT_TYPES.ADJUSTMENT,
        quantityDelta,
        reason: inp.reason ?? 'manual_adjustment',
        runtimeExecutionId: governance.runtimeExecutionId,
        missionId: governance.missionId,
        actorUserId: governance.userId,
        metadata: inp.metadata ?? null,
      });

      return {
        inventoryItemId,
        movementId: movement.movement.id,
        onHand: movement.onHand,
        businessEventId: movement.businessEvent?.id,
      };
    },
  });
}

export default execute;
