import { describe, it, expect, vi, beforeEach } from 'vitest';
import { calculateOnHandQuantity, recordInventoryMovement } from '../inventoryMovementEngine.js';
import { INVENTORY_MOVEMENT_TYPES } from '../constants.js';

describe('inventoryMovementEngine', () => {
  const movements = [];

  function mockPrisma() {
    return {
      inventoryMovement: {
        aggregate: vi.fn(async ({ where }) => {
          const sum = movements
            .filter((m) => m.inventoryItemId === where.inventoryItemId)
            .reduce((s, m) => s + m.quantityDelta, 0);
          return { _sum: { quantityDelta: sum } };
        }),
        create: vi.fn(async ({ data }) => {
          const row = { id: `mov-${movements.length + 1}`, ...data, createdAt: new Date() };
          movements.push(row);
          return row;
        }),
      },
      businessEvent: {
        create: vi.fn(async ({ data }) => ({ id: `evt-${movements.length}`, ...data, createdAt: new Date() })),
      },
    };
  }

  beforeEach(() => {
    movements.length = 0;
  });

  it('calculates on-hand from movement sum', async () => {
    const prisma = mockPrisma();
    movements.push({ inventoryItemId: 'inv-1', quantityDelta: 10 });
    movements.push({ inventoryItemId: 'inv-1', quantityDelta: -3 });
    const onHand = await calculateOnHandQuantity(prisma, 'inv-1');
    expect(onHand).toBe(7);
  });

  it('records purchase movement and event', async () => {
    const prisma = mockPrisma();
    const result = await recordInventoryMovement(prisma, {
      storeId: 'store-1',
      inventoryItemId: 'inv-1',
      movementType: INVENTORY_MOVEMENT_TYPES.PURCHASE,
      quantityDelta: 5,
      actorUserId: 'user-1',
    });
    expect(result.movement.quantityDelta).toBe(5);
    expect(result.onHand).toBe(5);
    expect(prisma.businessEvent.create).toHaveBeenCalled();
  });
});
