/**
 * SmartDocument preset — Card (CC-2)
 *
 * Default configuration for business cards, loyalty cards, promo cards,
 * gift cards, and profile cards.
 */

import { getDocSize } from '../documentSizeStandards.js';

/**
 * @typedef {import('../documentSizeStandards.js').DocSize} DocSize
 */

/**
 * @typedef {{
 *   docType: 'card',
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
 * }} CardPreset
 */

/** @type {Record<string, CardPreset>} */
const CARD_PRESETS = {
  profile: {
    docType: 'card',
    subtype: 'profile',
    ...sizeFields(getDocSize('card', 'cr80')),
    capabilities: ['chat', 'capture_lead', 'share_contact', 'social_follow'],
    agentPersonality: 'professional and friendly business representative',
    autoApprove: true,
    phaseConfig: {},
    designJson: { template: 'profile', theme: 'modern' },
  },

  loyalty: {
    docType: 'card',
    subtype: 'loyalty',
    ...sizeFields(getDocSize('card', 'cr80')),
    capabilities: ['record_stamp', 'chat', 'capture_lead'],
    agentPersonality: 'helpful loyalty rewards assistant',
    autoApprove: true,
    phaseConfig: { maxStamps: 10 },
    designJson: { template: 'loyalty', theme: 'warm' },
  },

  promo: {
    docType: 'card',
    subtype: 'promo',
    ...sizeFields(getDocSize('card', 'cr80')),
    capabilities: ['redeem_promo', 'chat', 'capture_lead'],
    agentPersonality: 'energetic promotions assistant',
    autoApprove: true,
    phaseConfig: {},
    designJson: { template: 'promo', theme: 'bold' },
  },

  gift: {
    docType: 'card',
    subtype: 'gift',
    ...sizeFields(getDocSize('card', 'cr80')),
    capabilities: ['redeem_promo', 'chat', 'capture_lead'],
    agentPersonality: 'warm and celebratory gift card assistant',
    autoApprove: true,
    phaseConfig: {},
    designJson: { template: 'gift', theme: 'festive' },
  },

  invitation: {
    docType: 'card',
    subtype: 'invitation',
    ...sizeFields(getDocSize('card', 'cr80')),
    capabilities: ['record_rsvp', 'chat', 'capture_lead', 'show_map'],
    agentPersonality: 'welcoming event host assistant',
    autoApprove: true,
    phaseConfig: {},
    designJson: { template: 'invitation', theme: 'elegant' },
  },
};

/**
 * Retrieve a card preset by subtype.
 * Falls back to 'profile' if subtype is not recognised.
 *
 * @param {string} [subtype]
 * @returns {CardPreset}
 */
export function getCardPreset(subtype) {
  return CARD_PRESETS[subtype ?? 'profile'] ?? CARD_PRESETS.profile;
}

/** @returns {string[]} All supported card subtypes */
export function cardSubtypes() {
  return Object.keys(CARD_PRESETS);
}

// ── Helpers ────────────────────────────────────────────────────────────────

/** @param {DocSize} size */
function sizeFields(size) {
  return { sizeW: size.w, sizeH: size.h, sizeUnit: size.unit, sizeDpi: size.dpi };
}
