import { executeBusinessTool } from './_shared.js';
import { cancelPosOrder } from '../../business/posOrderAggregate.js';

export async function execute(input = {}, context = {}) {
  return executeBusinessTool({
    toolName: 'cancel_order',
    input,
    context,
    handler: async ({ prisma, input: inp, governance }) => {
      const orderId = inp.orderId ?? inp.posOrderId;
      if (!orderId) {
        const err = new Error('orderId is required');
        err.code = 'ORDER_ID_REQUIRED';
        throw err;
      }
      const result = await cancelPosOrder(prisma, {
        orderId,
        storeId: governance.storeId,
        reason: inp.reason ?? null,
        runtimeExecutionId: governance.runtimeExecutionId,
        missionId: governance.missionId,
        actorUserId: governance.userId,
      });
      return { orderId, businessEventId: result.businessEvent?.id, order: result.order };
    },
  });
}

export default execute;
