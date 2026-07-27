import { executeBusinessTool } from './_shared.js';
import { checkoutPosOrder } from '../../business/posOrderAggregate.js';

export async function execute(input = {}, context = {}) {
  return executeBusinessTool({
    toolName: 'checkout_order',
    input,
    context,
    handler: async ({ prisma, input: inp, governance }) => {
      const orderId = inp.orderId ?? inp.posOrderId;
      if (!orderId) {
        const err = new Error('orderId is required');
        err.code = 'ORDER_ID_REQUIRED';
        throw err;
      }
      const result = await checkoutPosOrder(prisma, {
        orderId,
        storeId: governance.storeId,
        paymentMethod: inp.paymentMethod ?? inp.method ?? 'cash',
        paymentAmount: inp.paymentAmount ?? inp.amount ?? null,
        deductInventory: inp.deductInventory !== false,
        runtimeExecutionId: governance.runtimeExecutionId,
        missionId: governance.missionId,
        actorUserId: governance.userId,
      });
      return {
        orderId: result.order.id,
        paymentId: result.payment.id,
        receiptId: result.receipt?.id ?? null,
        businessEventId: result.businessEvent?.id,
        result,
      };
    },
  });
}

export default execute;
