/**
 * Stripe webhook processing — verify signature and update payments + linked entities.
 */

import { getPrismaClient } from '../prisma.js';
import { loadStripeClient } from './stripeClient.js';
import { PAYMENT_STATUSES } from './paymentTypes.js';
import { updatePaymentStatus } from './paymentIntentService.js';
import { emitCustomerInquiryActivity } from '../storeActivity/storeActivityHooks.js';

/**
 * @param {Buffer|string} rawBody
 * @param {string} signature
 */
export async function handleStripeWebhook(rawBody, signature) {
  const stripe = await loadStripeClient();
  const webhookSecret =
    typeof process.env.STRIPE_WEBHOOK_SECRET === 'string' ? process.env.STRIPE_WEBHOOK_SECRET.trim() : '';

  if (!stripe || !webhookSecret) {
    const err = new Error('Stripe webhook not configured');
    err.code = 'STRIPE_NOT_CONFIGURED';
    throw err;
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    const sigErr = new Error('Invalid webhook signature');
    sigErr.code = 'INVALID_SIGNATURE';
    sigErr.cause = err;
    throw sigErr;
  }

  switch (event.type) {
    case 'payment_intent.succeeded':
      await onPaymentIntentSucceeded(event.data.object);
      break;
    case 'payment_intent.payment_failed':
      await onPaymentIntentFailed(event.data.object);
      break;
    case 'checkout.session.completed':
      await onCheckoutSessionCompleted(event.data.object);
      break;
    case 'charge.refunded':
      await onChargeRefunded(event.data.object);
      break;
    default:
      break;
  }

  return { received: true, type: event.type };
}

/**
 * @param {import('stripe').Stripe.PaymentIntent} intent
 */
async function onPaymentIntentSucceeded(intent) {
  const paymentId = intent.metadata?.paymentId;
  if (!paymentId) return;

  const prisma = getPrismaClient();
  await updatePaymentStatus(paymentId, PAYMENT_STATUSES.SUCCEEDED, {
    metadata: { stripePaymentIntentId: intent.id, lastEvent: 'payment_intent.succeeded' },
  });

  const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
  if (!payment) return;

  await confirmLinkedEntity(payment, prisma);
}

/**
 * @param {import('stripe').Stripe.PaymentIntent} intent
 */
async function onPaymentIntentFailed(intent) {
  const paymentId = intent.metadata?.paymentId;
  if (!paymentId) return;
  await updatePaymentStatus(paymentId, PAYMENT_STATUSES.FAILED, {
    metadata: { stripePaymentIntentId: intent.id, lastEvent: 'payment_intent.payment_failed' },
  });
}

/**
 * @param {import('stripe').Stripe.Checkout.Session} session
 */
async function onCheckoutSessionCompleted(session) {
  const paymentId = session.metadata?.paymentId;
  if (!paymentId) return;

  const prisma = getPrismaClient();
  await updatePaymentStatus(paymentId, PAYMENT_STATUSES.SUCCEEDED, {
    metadata: { stripeCheckoutSessionId: session.id, lastEvent: 'checkout.session.completed' },
  });

  const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
  if (!payment) return;
  await confirmLinkedEntity(payment, prisma);
}

/**
 * @param {import('stripe').Stripe.Charge} charge
 */
async function onChargeRefunded(charge) {
  const prisma = getPrismaClient();
  const intentId = typeof charge.payment_intent === 'string' ? charge.payment_intent : null;
  if (!intentId) return;

  const payment = await prisma.payment.findFirst({
    where: { stripePaymentIntentId: intentId },
  });
  if (!payment) return;

  await updatePaymentStatus(payment.id, PAYMENT_STATUSES.REFUNDED, {
    metadata: { lastEvent: 'charge.refunded' },
  });
}

/**
 * @param {object} payment
 * @param {import('@prisma/client').PrismaClient} prisma
 */
async function confirmLinkedEntity(payment, prisma) {
  const { linkedEntityType, linkedEntityId, storeId } = payment;
  if (!linkedEntityType || !linkedEntityId) return;

  if (linkedEntityType === 'booking' && prisma.booking?.update) {
    await prisma.booking.update({
      where: { id: linkedEntityId },
      data: {
        status: 'confirmed',
        metadata: {
          paymentId: payment.id,
          paymentStatus: PAYMENT_STATUSES.SUCCEEDED,
        },
      },
    });
    emitCustomerInquiryActivity({ storeId, entityId: linkedEntityId });
    return;
  }

  if (linkedEntityType === 'pos_order' && prisma.posOrder?.update) {
    await prisma.posOrder.update({
      where: { id: linkedEntityId },
      data: { status: 'paid' },
    });
    return;
  }

  if (linkedEntityType === 'quote_request' && prisma.quoteRequest?.update) {
    await prisma.quoteRequest.update({
      where: { id: linkedEntityId },
      data: {
        metadata: {
          depositPaymentId: payment.id,
          depositPaid: true,
        },
      },
    });
  }
}
