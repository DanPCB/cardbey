/**
 * Capability Registry — CC-1
 *
 * 18 named capabilities for SmartDocument agents.
 * Each entry describes the action marker (used in capability JSON arrays),
 * a human-readable label, and optional resource descriptors.
 *
 * Usage:
 *   import { CAPABILITIES, getCapability, capabilityList } from './capabilityRegistry.js';
 */

/** @typedef {{ key: string, actionMarker: string, label: string, description: string, resources?: string[] }} Capability */

/** @type {Capability[]} */
const CAPABILITY_DEFINITIONS = [
  {
    key: 'chat',
    actionMarker: 'chat',
    label: 'Chat',
    description: 'Embedded conversational agent (text chat with visitor)',
    resources: ['docConversation'],
  },
  {
    key: 'record_stamp',
    actionMarker: 'record_stamp',
    label: 'Loyalty Stamp',
    description: 'Record a loyalty stamp for a visitor',
    resources: ['loyaltyStamp'],
  },
  {
    key: 'redeem_promo',
    actionMarker: 'redeem_promo',
    label: 'Promo Redemption',
    description: 'Redeem a promotional discount or offer',
    resources: ['promoRedemption'],
  },
  {
    key: 'record_rsvp',
    actionMarker: 'record_rsvp',
    label: 'Event RSVP',
    description: 'Capture an event RSVP (attending / declined / maybe)',
    resources: ['eventRsvp'],
  },
  {
    key: 'capture_lead',
    actionMarker: 'capture_lead',
    label: 'Lead Capture',
    description: 'Collect visitor contact details (phone, email, name)',
    resources: ['docVisitor'],
  },
  {
    key: 'book_appointment',
    actionMarker: 'book_appointment',
    label: 'Appointment Booking',
    description: 'Book an appointment or calendar event',
    resources: ['externalCalendar'],
  },
  {
    key: 'check_in',
    actionMarker: 'check_in',
    label: 'Check-In',
    description: 'Record a physical or digital check-in for a visitor',
    resources: ['docCheckIn'],
  },
  {
    key: 'collect_signature',
    actionMarker: 'collect_signature',
    label: 'Digital Signature',
    description: 'Collect a digital signature from a visitor',
    resources: ['docSignature'],
  },
  {
    key: 'display_menu',
    actionMarker: 'display_menu',
    label: 'Menu Display',
    description: 'Display a product or service menu to visitors',
    resources: [],
  },
  {
    key: 'display_gallery',
    actionMarker: 'display_gallery',
    label: 'Gallery',
    description: 'Show an image or media gallery',
    resources: [],
  },
  {
    key: 'share_contact',
    actionMarker: 'share_contact',
    label: 'Contact Share',
    description: 'Share business contact details (vCard / QR)',
    resources: [],
  },
  {
    key: 'show_map',
    actionMarker: 'show_map',
    label: 'Location Map',
    description: 'Embed a map showing the business location',
    resources: [],
  },
  {
    key: 'social_follow',
    actionMarker: 'social_follow',
    label: 'Social Follow',
    description: 'Prompt visitor to follow on social platforms',
    resources: [],
  },
  {
    key: 'newsletter_signup',
    actionMarker: 'newsletter_signup',
    label: 'Newsletter Sign-Up',
    description: 'Subscribe visitor to email newsletter',
    resources: ['docVisitor'],
  },
  {
    key: 'feedback_form',
    actionMarker: 'feedback_form',
    label: 'Feedback Form',
    description: 'Collect structured visitor feedback',
    resources: ['docConversation'],
  },
  {
    key: 'survey',
    actionMarker: 'survey',
    label: 'Survey',
    description: 'Run a short survey or NPS form',
    resources: ['docConversation'],
  },
  {
    key: 'download_asset',
    actionMarker: 'download_asset',
    label: 'Asset Download',
    description: 'Provide a file download (PDF, voucher, etc.)',
    resources: [],
  },
  {
    key: 'embed_video',
    actionMarker: 'embed_video',
    label: 'Video Embed',
    description: 'Embed a YouTube / Vimeo / hosted video',
    resources: [],
  },
];

/** @type {Map<string, Capability>} */
const BY_KEY = new Map(CAPABILITY_DEFINITIONS.map((c) => [c.key, c]));

/** @type {Map<string, Capability>} */
const BY_MARKER = new Map(CAPABILITY_DEFINITIONS.map((c) => [c.actionMarker, c]));

/**
 * Retrieve a capability definition by its key.
 * @param {string} key
 * @returns {Capability | undefined}
 */
export function getCapability(key) {
  return BY_KEY.get(key);
}

/**
 * Retrieve a capability definition by its actionMarker (used in stored JSON arrays).
 * @param {string} marker
 * @returns {Capability | undefined}
 */
export function getCapabilityByMarker(marker) {
  return BY_MARKER.get(marker);
}

/**
 * Return an ordered array of all capability definitions.
 * @returns {Capability[]}
 */
export function capabilityList() {
  return [...CAPABILITY_DEFINITIONS];
}

/**
 * Parse a capabilities JSON string (as stored on SmartDocument.capabilities) into an array of keys.
 * @param {string | null | undefined} raw
 * @returns {string[]}
 */
export function parseCapabilities(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((k) => typeof k === 'string');
  } catch {
    return [];
  }
}

/**
 * Serialize a capabilities array to the JSON string stored on SmartDocument.capabilities.
 * Only known capability keys are kept.
 * @param {string[]} keys
 * @returns {string}
 */
export function serializeCapabilities(keys) {
  const valid = (Array.isArray(keys) ? keys : []).filter(
    (k) => typeof k === 'string' && BY_KEY.has(k),
  );
  return JSON.stringify(valid);
}

/** All 18 capability definitions (direct export for convenience). */
export const CAPABILITIES = CAPABILITY_DEFINITIONS;
