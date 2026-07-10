/**
 * Server-side journey payment amount resolution — never trust client amount.
 */

import { getDefaultCurrency } from './stripeClient.js';
import { PAYMENT_PURPOSES } from './paymentTypes.js';

const PURPOSE_SET = new Set(PAYMENT_PURPOSES);

/**
 * @param {object} params
 * @param {string} params.purpose
 * @param {Record<string, unknown>} [params.catalogItem]
 * @param {Record<string, unknown>} [params.journeyConfig]
 * @param {Record<string, unknown>} [params.store]
 * @param {number} [params.orderTotal]
 * @param {number} [params.depositAmount]
 */
export function resolveJourneyPaymentAmount(params) {
  const { purpose, catalogItem = {}, journeyConfig = {}, store = {} } = params;
  if (!PURPOSE_SET.has(purpose)) {
    const err = new Error(`Invalid payment purpose: ${purpose}`);
    err.code = 'INVALID_PURPOSE';
    throw err;
  }

  const currency =
    String(catalogItem.currency ?? journeyConfig.currency ?? store.currency ?? getDefaultCurrency()).toUpperCase() ||
    getDefaultCurrency();

  let amountCents = 0;
  let required = false;

  const price = readMoney(catalogItem.price ?? catalogItem.fromPrice);
  const custom = journeyConfig && typeof journeyConfig === 'object' ? journeyConfig : {};
  const itemCustom =
    catalogItem.customServiceJourney && typeof catalogItem.customServiceJourney === 'object'
      ? catalogItem.customServiceJourney
      : {};

  switch (purpose) {
    case 'booking_payment': {
      const requiresUpfront =
        custom.requiresUpfrontPayment === true ||
        itemCustom.requiresUpfrontPayment === true ||
        catalogItem.requiresUpfrontPayment === true;
      if (requiresUpfront && price > 0) {
        amountCents = toCents(price);
        required = true;
      } else if (price > 0 && catalogItem.serviceMode === 'fixed_booking') {
        amountCents = toCents(price);
        required = true;
      }
      break;
    }
    case 'inspection_fee': {
      const fee = readMoney(
        custom.inspectionFee ?? itemCustom.inspectionFee ?? catalogItem.inspectionFee ?? 0,
      );
      if (fee > 0) {
        amountCents = toCents(fee);
        required = true;
      }
      break;
    }
    case 'consultation_fee': {
      const fee = readMoney(
        custom.consultationFee ?? itemCustom.consultationFee ?? catalogItem.consultationFee ?? 0,
      );
      if (fee > 0) {
        amountCents = toCents(fee);
        required = true;
      }
      break;
    }
    case 'order_payment': {
      const orderTotal = readMoney(params.orderTotal);
      if (orderTotal > 0) {
        amountCents = toCents(orderTotal);
        required = true;
      }
      break;
    }
    case 'deposit':
    case 'quote_acceptance_deposit': {
      const deposit = readMoney(custom.depositAmount ?? params.depositAmount ?? 0);
      if (deposit > 0) {
        amountCents = toCents(deposit);
        required = true;
      }
      break;
    }
    default:
      break;
  }

  return {
    required,
    amountCents,
    amount: amountCents / 100,
    currency,
    purpose,
  };
}

/**
 * Resolve payment for a multi-service booking cart — amounts from server catalog only.
 * @param {Array<Record<string, unknown>>} catalogItems
 */
export function resolveBookingCartPaymentAmount(catalogItems = []) {
  let amountCents = 0;
  let required = false;
  let currency = getDefaultCurrency();

  for (const catalogItem of catalogItems) {
    const resolved = resolveJourneyPaymentAmount({
      purpose: 'booking_payment',
      catalogItem,
    });
    if (resolved.required) {
      required = true;
      amountCents += resolved.amountCents;
      currency = resolved.currency;
    }
  }

  return {
    required: required && amountCents > 0,
    amountCents,
    amount: amountCents / 100,
    currency,
    purpose: 'booking_payment',
  };
}

/**
 * @param {string} intent
 * @param {string} [bookingType]
 */
export function purposeForJourneyIntent(intent, bookingType) {
  if (intent === 'book_inspection' || bookingType === 'inspection') return 'inspection_fee';
  if (intent === 'book_consultation' || bookingType === 'consultation') return 'consultation_fee';
  if (intent === 'request_quote' || intent === 'upload_project_details' || intent === 'request_callback') {
    return null;
  }
  return 'booking_payment';
}

function readMoney(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function toCents(amount) {
  return Math.round(amount * 100);
}
