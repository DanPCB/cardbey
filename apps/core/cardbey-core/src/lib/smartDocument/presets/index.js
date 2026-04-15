/**
 * SmartDocument Presets — barrel export (CC-2)
 *
 * Convenience re-export of all preset resolvers and subtype lists.
 *
 * Usage:
 *   import { getPreset, subtypesFor } from './presets/index.js';
 *   const preset = getPreset('card', 'loyalty');
 *   const types  = subtypesFor('ticket');
 */

export { getCardPreset, cardSubtypes } from './card.js';
export { getTicketPreset, ticketSubtypes } from './ticket.js';
export { getReportPreset, reportSubtypes } from './report.js';

/**
 * Universal preset resolver.
 * Returns the best-matching preset for any docType + subtype combination.
 *
 * @param {string} docType   - SmartDocument.docType
 * @param {string} [subtype] - optional subtype
 * @returns {object}         - preset definition
 */
export async function getPreset(docType, subtype) {
  switch (docType) {
    case 'card': {
      const { getCardPreset } = await import('./card.js');
      return getCardPreset(subtype);
    }
    case 'ticket': {
      const { getTicketPreset } = await import('./ticket.js');
      return getTicketPreset(subtype);
    }
    case 'report': {
      const { getReportPreset } = await import('./report.js');
      return getReportPreset(subtype);
    }
    default: {
      // Unknown docType — fall back to a generic card preset
      const { getCardPreset } = await import('./card.js');
      return { ...getCardPreset('profile'), docType, subtype: subtype ?? null };
    }
  }
}

/**
 * List available subtypes for a given docType.
 *
 * @param {string} docType
 * @returns {string[]}
 */
export async function subtypesFor(docType) {
  switch (docType) {
    case 'card': {
      const { cardSubtypes } = await import('./card.js');
      return cardSubtypes();
    }
    case 'ticket': {
      const { ticketSubtypes } = await import('./ticket.js');
      return ticketSubtypes();
    }
    case 'report': {
      const { reportSubtypes } = await import('./report.js');
      return reportSubtypes();
    }
    default:
      return [];
  }
}
