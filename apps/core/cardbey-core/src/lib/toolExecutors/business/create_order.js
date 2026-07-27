import { executeBusinessTool } from './_shared.js';
import { createPosOrder } from '../../business/posOrderAggregate.js';

export async function execute(input = {}, context = {}) {
  return executeBusinessTool({
    toolName: 'create_order',
    input,
    context,
    handler: async ({ prisma, input: inp, governance }) => {
      const order = await createPosOrder(prisma, {
        storeId: governance.storeId,
        channel: inp.channel ?? 'pos',
        deliveryMethod: inp.deliveryMethod ?? null,
        tableId: inp.tableId ?? null,
        customerId: inp.customerId ?? null,
        staffId: inp.staffId ?? null,
        shiftId: inp.shiftId ?? null,
        notes: inp.notes ?? null,
        items: inp.items ?? [],
        currency: inp.currency ?? 'AUD',
        runtimeExecutionId: governance.runtimeExecutionId,
        missionId: governance.missionId,
        actorUserId: governance.userId,
      });
      return { orderId: order.id, orderNumber: order.orderNumber, order, businessEventId: order.businessEvent?.id };
    },
  });
}

export default execute;
