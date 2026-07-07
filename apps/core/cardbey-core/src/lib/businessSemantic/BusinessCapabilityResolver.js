/**
 * Resolve capability flags from canonical business type and industry signals.
 */

import { CAPABILITY_KEYS } from './types.js';

/** @param {string} businessType @param {string} corpus */
export function resolveCapabilities(businessType, corpus = '') {
  const text = String(corpus ?? '').toLowerCase();
  const allOff = Object.fromEntries(CAPABILITY_KEYS.map((k) => [k, false]));

  switch (businessType) {
    case 'product_retail':
      return {
        ...allOff,
        cart: true,
        checkout: true,
        inventory: true,
        shipping: true,
        returns: true,
        gallery: true,
        reviews: true,
        loyalty: /\b(loyalty|rewards|membership)\b/i.test(text),
      };
    case 'service_fixed_booking':
      return {
        ...allOff,
        booking: true,
        calendar: true,
        appointments: true,
        memberships: /\b(membership|package|subscription)\b/i.test(text),
        gallery: true,
        reviews: true,
        loyalty: true,
      };
    case 'service_quote_required':
      return {
        ...allOff,
        quotation: true,
        inspection_booking: /\b(inspection|measurement|site visit|call-?out)\b/i.test(text),
        consultation: /\bconsultation\b/i.test(text),
        file_intake: /\b(photo|document|upload|plan|drawing|project details)\b/i.test(text),
        projects: true,
        portfolio: true,
        gallery: true,
        reviews: true,
        calendar: /\b(inspection|measurement|site visit)\b/i.test(text),
        appointments: /\b(inspection|measurement|site visit)\b/i.test(text),
      };
    case 'food_menu':
      return {
        ...allOff,
        menu: true,
        ordering: true,
        delivery: /\b(delivery|takeaway|take away|uber|doordash)\b/i.test(text),
        table_booking: /\b(reservation|book a table|dine in)\b/i.test(text),
        reservation: /\b(reservation|book a table)\b/i.test(text),
        kitchen: true,
        reviews: true,
        loyalty: true,
      };
    case 'hybrid':
      return {
        ...allOff,
        cart: true,
        checkout: true,
        booking: true,
        calendar: true,
        appointments: true,
        quotation: /\b(quote|custom|bespoke|project)\b/i.test(text),
        inspection_booking: /\b(inspection|measurement|site visit|call-?out|til(e|ing)|floor)\b/i.test(text),
        consultation: /\bconsultation\b/i.test(text),
        file_intake: /\b(photo|document|upload|plan|drawing|project)\b/i.test(text),
        gallery: true,
        reviews: true,
        inventory: true,
      };
    default:
      return { ...allOff, gallery: true, reviews: true };
  }
}

/** @param {import('./types.js').BusinessCapabilities} capabilities @param {string} key */
export function hasCapability(capabilities, key) {
  return capabilities?.[key] === true;
}
