import { executeBusinessTool } from './_shared.js';
import { recordPayment } from '../../business/paymentService.js';

export async function execute(input = {}, context = {}) {
  return executeBusinessTool({
    toolName: 'record_payment',
    input,
    context,
    handler: async ({ prisma, input: inp, governance }) => {
      const amount = Number(inp.amount ?? inp.paymentAmount);
      if (!amount || amount <= 0) {
        const err = new Error('positive amount is required');
        err.code = 'INVALID_AMOUNT';
        throw err;
      }
      const result = await recordPayment(prisma, {
        storeId: governance.storeId,
        posOrderId: inp.orderId ?? inp.posOrderId ?? null,
        method: inp.paymentMethod ?? inp.method ?? 'cash',
        amount,
        currency: inp.currency ?? 'AUD',
        externalRef: inp.externalRef ?? null,
        runtimeExecutionId: governance.runtimeExecutionId,
        missionId: governance.missionId,
        actorUserId: governance.userId,
        metadata: inp.metadata ?? null,
      });
      return {
        paymentId: result.payment.id,
        businessEventId: result.businessEvent?.id,
        payment: result.payment,
      };
    },
  });
}

export default execute;
