/**
 * Stripe PaymentIntent creation and persistence.
 */

import cuid from 'cuid';
import { getPrismaClient } from '../prisma.js';
import { loadStripeClient } from './stripeClient.js';
import { PAYMENT_STATUSES, STRIPE_PAYMENT_METHOD } from './paymentTypes.js';
import { resolveJourneyPaymentAmount } from './paymentAmountResolver.js';

/**
 * @param {object} input
 */
export async function createPaymentIntentForJourney(input) {
  const prisma = getPrismaClient();
  const stripe = await loadStripeClient();
  if (!stripe) {
    const err = new Error('Stripe is not configured');
    err.code = 'STRIPE_NOT_CONFIGURED';
    throw err;
  }

  const {
    storeId,
    purpose,
    catalogItem = {},
    journeyConfig = {},
    customerId = null,
    journeyId = null,
    linkedEntityType = null,
    linkedEntityId = null,
    metadata = {},
  } = input;

  const resolved = resolveJourneyPaymentAmount({
    purpose,
    catalogItem,
    journeyConfig,
    store: input.store,
    orderTotal: input.orderTotal,
    depositAmount: input.depositAmount,
  });

  if (!resolved.required || resolved.amountCents <= 0) {
    return { required: false, payment: null, clientSecret: null };
  }

  const paymentId = cuid();
  const intent = await stripe.paymentIntents.create({
    amount: resolved.amountCents,
    currency: resolved.currency.toLowerCase(),
    automatic_payment_methods: { enabled: true },
    metadata: {
      paymentId,
      storeId,
      purpose,
      linkedEntityType: linkedEntityType ?? '',
      linkedEntityId: linkedEntityId ?? '',
      journeyId: journeyId ?? '',
    },
  });

  const payment = await prisma.payment.create({
    data: {
      id: paymentId,
      storeId,
      customerId,
      journeyId,
      linkedEntityType,
      linkedEntityId,
      stripePaymentIntentId: intent.id,
      method: STRIPE_PAYMENT_METHOD,
      status: PAYMENT_STATUSES.PENDING,
      amount: resolved.amount,
      currency: resolved.currency,
      purpose,
      externalRef: intent.id,
      metadata: {
        ...metadata,
        stripePaymentIntentId: intent.id,
        purpose,
      },
    },
  });

  return {
    required: true,
    payment,
    clientSecret: intent.client_secret,
    publishableKey: typeof process.env.STRIPE_PUBLISHABLE_KEY === 'string' ? process.env.STRIPE_PUBLISHABLE_KEY.trim() : '',
    amount: resolved.amount,
    currency: resolved.currency,
    purpose,
  };
}

/**
 * @param {string} paymentId
 */
export async function getPaymentStatus(paymentId) {
  const prisma = getPrismaClient();
  const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
  if (!payment) {
    const err = new Error('Payment not found');
    err.code = 'NOT_FOUND';
    throw err;
  }
  return payment;
}

/**
 * @param {string} paymentId
 * @param {string} status
 * @param {object} [patch]
 */
export async function updatePaymentStatus(paymentId, status, patch = {}) {
  const prisma = getPrismaClient();
  return prisma.payment.update({
    where: { id: paymentId },
    data: {
      status,
      metadata: patch.metadata ?? undefined,
      updatedAt: new Date(),
    },
  });
}
