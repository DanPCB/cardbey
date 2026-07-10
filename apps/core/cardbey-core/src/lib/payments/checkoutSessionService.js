/**
 * Stripe Checkout Session — optional redirect flow for retail/cart.
 */

import cuid from 'cuid';
import { getPrismaClient } from '../prisma.js';
import { loadStripeClient, getDefaultCurrency } from './stripeClient.js';
import { PAYMENT_STATUSES, STRIPE_PAYMENT_METHOD } from './paymentTypes.js';
import { resolveJourneyPaymentAmount } from './paymentAmountResolver.js';

/**
 * @param {object} input
 */
export async function createCheckoutSession(input) {
  const stripe = await loadStripeClient();
  if (!stripe) {
    const err = new Error('Stripe is not configured');
    err.code = 'STRIPE_NOT_CONFIGURED';
    throw err;
  }

  const prisma = getPrismaClient();
  const {
    storeId,
    purpose = 'order_payment',
    catalogItem = {},
    lineItems = [],
    successUrl,
    cancelUrl,
    customerId = null,
    linkedEntityType = null,
    linkedEntityId = null,
    metadata = {},
  } = input;

  const orderTotal = lineItems.reduce((sum, li) => sum + Number(li.amount ?? 0) * Number(li.quantity ?? 1), 0);
  const resolved = resolveJourneyPaymentAmount({
    purpose,
    catalogItem,
    orderTotal,
    store: input.store,
  });

  if (!resolved.required || resolved.amountCents <= 0) {
    const err = new Error('No payment required for this checkout');
    err.code = 'PAYMENT_NOT_REQUIRED';
    throw err;
  }

  const paymentId = cuid();
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    success_url: successUrl,
    cancel_url: cancelUrl,
    line_items: lineItems.length
      ? lineItems.map((li) => ({
          price_data: {
            currency: resolved.currency.toLowerCase(),
            product_data: { name: String(li.name ?? 'Item') },
            unit_amount: Math.round(Number(li.amount ?? 0) * 100),
          },
          quantity: Math.max(1, Number(li.quantity ?? 1)),
        }))
      : [
          {
            price_data: {
              currency: resolved.currency.toLowerCase(),
              product_data: { name: String(catalogItem.name ?? 'Order') },
              unit_amount: resolved.amountCents,
            },
            quantity: 1,
          },
        ],
    metadata: {
      paymentId,
      storeId,
      purpose,
      linkedEntityType: linkedEntityType ?? '',
      linkedEntityId: linkedEntityId ?? '',
    },
  });

  const payment = await prisma.payment.create({
    data: {
      id: paymentId,
      storeId,
      customerId,
      linkedEntityType,
      linkedEntityId,
      stripeCheckoutSessionId: session.id,
      stripePaymentIntentId: typeof session.payment_intent === 'string' ? session.payment_intent : null,
      method: STRIPE_PAYMENT_METHOD,
      status: PAYMENT_STATUSES.PENDING,
      amount: resolved.amount,
      currency: resolved.currency || getDefaultCurrency(),
      purpose,
      externalRef: session.id,
      metadata: { ...metadata, stripeCheckoutSessionId: session.id, purpose },
    },
  });

  return {
    payment,
    sessionId: session.id,
    url: session.url,
  };
}
