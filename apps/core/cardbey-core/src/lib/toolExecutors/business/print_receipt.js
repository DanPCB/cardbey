import { executeBusinessTool } from './_shared.js';
import { BUSINESS_EVENT_TYPES, appendBusinessEvent } from '../../business/businessEventService.js';

export async function execute(input = {}, context = {}) {
  return executeBusinessTool({
    toolName: 'print_receipt',
    input,
    context,
    handler: async ({ prisma, input: inp, governance }) => {
      const posOrderId = inp.orderId ?? inp.posOrderId;
      if (!posOrderId) {
        const err = new Error('orderId is required');
        err.code = 'ORDER_ID_REQUIRED';
        throw err;
      }

      let receipt = null;
      if (prisma?.receipt?.findFirst) {
        receipt = await prisma.receipt.findFirst({
          where: { posOrderId, storeId: governance.storeId },
          orderBy: { createdAt: 'desc' },
        });
      }

      if (receipt && prisma?.receipt?.update) {
        receipt = await prisma.receipt.update({
          where: { id: receipt.id },
          data: { printedAt: new Date() },
        });
      }

      const businessEvent = await appendBusinessEvent(prisma, {
        storeId: governance.storeId,
        eventType: BUSINESS_EVENT_TYPES.RECEIPT_PRINTED,
        aggregateType: 'pos_order',
        aggregateId: posOrderId,
        payload: { receiptId: receipt?.id ?? null },
        actorUserId: governance.userId,
        runtimeExecutionId: governance.runtimeExecutionId,
        missionId: governance.missionId,
      });

      return { receiptId: receipt?.id ?? null, printedAt: receipt?.printedAt ?? new Date().toISOString(), businessEventId: businessEvent?.id };
    },
  });
}

export default execute;
