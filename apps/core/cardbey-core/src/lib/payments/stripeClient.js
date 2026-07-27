/**
 * Stripe client singleton — server only.
 */

/** @type {import('stripe').Stripe | null} */
let stripeClient = null;

/**
 * @returns {Promise<import('stripe').Stripe | null>}
 */
export async function loadStripeClient() {
  const secret = typeof process.env.STRIPE_SECRET_KEY === 'string' ? process.env.STRIPE_SECRET_KEY.trim() : '';
  if (!secret) return null;
  if (stripeClient) return stripeClient;
  const { default: Stripe } = await import('stripe');
  stripeClient = new Stripe(secret, { apiVersion: '2024-06-20' });
  return stripeClient;
}

export function getDefaultCurrency() {
  const raw = typeof process.env.STRIPE_CURRENCY_DEFAULT === 'string' ? process.env.STRIPE_CURRENCY_DEFAULT.trim() : '';
  return raw || 'AUD';
}

export function isStripeConfigured() {
  return Boolean(typeof process.env.STRIPE_SECRET_KEY === 'string' && process.env.STRIPE_SECRET_KEY.trim());
}

export function getPublishableKey() {
  return typeof process.env.STRIPE_PUBLISHABLE_KEY === 'string' ? process.env.STRIPE_PUBLISHABLE_KEY.trim() : '';
}
