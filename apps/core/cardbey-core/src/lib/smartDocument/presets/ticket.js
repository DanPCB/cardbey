/**
 * SmartDocument preset — Ticket (CC-2)
 *
 * Default configuration for event tickets, digital passes, and wristbands.
 */

import { getDocSize } from '../documentSizeStandards.js';

/**
 * @typedef {import('../documentSizeStandards.js').DocSize} DocSize
 */

/**
 * @typedef {{
 *   docType: 'ticket',
 *   subtype: string,
 *   sizeW: number,
 *   sizeH: number,
 *   sizeUnit: 'mm',
 *   sizeDpi: number,
 *   capabilities: string[],
 *   agentPersonality: string,
 *   autoApprove: boolean,
 *   phaseConfig: import('../phaseEngine.js').PhaseConfig,
 *   designJson: object,
 * }} TicketPreset
 */

/** @type {Record<string, TicketPreset>} */
const TICKET_PRESETS = {
  event: {
    docType: 'ticket',
    subtype: 'event',
    ...sizeFields(getDocSize('ticket', 'standard')),
    capabilities: ['record_rsvp', 'check_in', 'chat', 'show_map'],
    agentPersonality: 'enthusiastic event assistant',
    autoApprove: true,
    phaseConfig: {},
    designJson: { template: 'event_ticket', theme: 'vibrant' },
  },

  concert: {
    docType: 'ticket',
    subtype: 'concert',
    ...sizeFields(getDocSize('ticket', 'standard')),
    capabilities: ['check_in', 'chat', 'show_map', 'social_follow'],
    agentPersonality: 'passionate music event host',
    autoApprove: true,
    phaseConfig: {},
    designJson: { template: 'concert_ticket', theme: 'dark' },
  },

  admission: {
    docType: 'ticket',
    subtype: 'admission',
    ...sizeFields(getDocSize('ticket', 'standard')),
    capabilities: ['check_in', 'chat', 'show_map'],
    agentPersonality: 'helpful venue admission assistant',
    autoApprove: true,
    phaseConfig: {},
    designJson: { template: 'admission_ticket', theme: 'professional' },
  },

  boarding: {
    docType: 'ticket',
    subtype: 'boarding',
    ...sizeFields(getDocSize('ticket', 'thermal')),
    capabilities: ['check_in', 'chat'],
    agentPersonality: 'efficient boarding pass assistant',
    autoApprove: false,
    phaseConfig: {},
    designJson: { template: 'boarding_pass', theme: 'minimal' },
  },

  voucher: {
    docType: 'ticket',
    subtype: 'voucher',
    ...sizeFields(getDocSize('ticket', 'stub')),
    capabilities: ['redeem_promo', 'chat', 'capture_lead'],
    agentPersonality: 'friendly promotions and voucher assistant',
    autoApprove: true,
    phaseConfig: {},
    designJson: { template: 'voucher', theme: 'bright' },
  },
};

/**
 * Retrieve a ticket preset by subtype.
 * Falls back to 'event' if subtype is not recognised.
 *
 * @param {string} [subtype]
 * @returns {TicketPreset}
 */
export function getTicketPreset(subtype) {
  return TICKET_PRESETS[subtype ?? 'event'] ?? TICKET_PRESETS.event;
}

/** @returns {string[]} All supported ticket subtypes */
export function ticketSubtypes() {
  return Object.keys(TICKET_PRESETS);
}

// ── Helpers ────────────────────────────────────────────────────────────────

/** @param {DocSize} size */
function sizeFields(size) {
  return { sizeW: size.w, sizeH: size.h, sizeUnit: size.unit, sizeDpi: size.dpi };
}
