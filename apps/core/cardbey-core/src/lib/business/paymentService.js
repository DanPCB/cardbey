/**
 * Payment abstraction — all payment records flow through runtime governance.
 */

import { PAYMENT_METHODS, PAYMENT_STATUS, BUSINESS_EVENT_TYPES } from './constants.js';
import { appendBusinessEvent } from './businessEventService.js';

export { PAYMENT_METHODS, PAYMENT_STATUS };

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {object} params
 */
export async function recordPayment(prisma, params) {
  const {
    storeId,
    posOrderId = null,
    method,
    amount,
    currency = 'AUD',
    status = PAYMENT_STATUS.CAPTURED,
    externalRef = null,
    runtimeExecutionId = null,
    missionId = null,
    actorUserId = null,
    metadata = null,
  } = params;

  if (!storeId || !method || amount == null) {
    const err = new Error('storeId, method, and amount are required');
    err.code = 'INVALID_PAYMENT';
    throw err;
  }

  if (!prisma?.payment?.create) {
    const err = new Error('Payment table not available');
    err.code = 'SCHEMA_UNAVAILABLE';
    throw err;
  }

  const payment = await prisma.payment.create({
    data: {
      storeId,
      posOrderId,
      method,
      amount: Number(amount),
      currency,
      status,
      externalRef,
      runtimeExecutionId,
      missionId,
      metadata: metadata ?? undefined,
    },
  });

  const businessEvent = await appendBusinessEvent(prisma, {
    storeId,
    eventType: BUSINESS_EVENT_TYPES.PAYMENT_RECEIVED,
    aggregateType: 'payment',
    aggregateId: payment.id,
    payload: {
      posOrderId,
      method,
      amount: Number(amount),
      currency,
      status,
    },
    actorUserId,
    runtimeExecutionId,
    missionId,
  });

  return { payment, businessEvent };
}
