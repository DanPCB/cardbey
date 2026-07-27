/**
 * Document Size Standards — CC-2
 *
 * Physical and screen size presets for SmartDocument rendering.
 * All measurements are in mm unless otherwise noted; dpi used for raster export.
 *
 * Usage:
 *   import { getDocSize, DOC_SIZES } from './documentSizeStandards.js';
 *   const size = getDocSize('card', 'cr80');        // standard business card
 *   const size = getDocSize('ticket', 'thermal');   // thermal event ticket
 */

/**
 * @typedef {{
 *   w: number,
 *   h: number,
 *   unit: 'mm',
 *   dpi: number,
 *   label: string,
 * }} DocSize
 */

/**
 * @type {Record<string, Record<string, DocSize>>}
 */
export const DOC_SIZES = {
  card: {
    /** ISO/IEC 7810 ID-1 — standard business / loyalty card */
    cr80: { w: 85.6, h: 54, unit: 'mm', dpi: 300, label: 'Business Card (CR80)' },
    /** Square card */
    square: { w: 64, h: 64, unit: 'mm', dpi: 300, label: 'Square Card' },
    /** Mini card — half CR80 */
    mini: { w: 54, h: 35, unit: 'mm', dpi: 300, label: 'Mini Card' },
    /** Wide / banner card */
    wide: { w: 100, h: 54, unit: 'mm', dpi: 300, label: 'Wide Card' },
  },

  ticket: {
    /** Standard event ticket */
    standard: { w: 190, h: 68, unit: 'mm', dpi: 300, label: 'Event Ticket' },
    /** Thermal receipt-style ticket */
    thermal: { w: 80, h: 200, unit: 'mm', dpi: 203, label: 'Thermal Ticket' },
    /** Stub ticket (wide with tear-off) */
    stub: { w: 210, h: 74, unit: 'mm', dpi: 300, label: 'Stub Ticket' },
    /** Square badge/wristband */
    wristband: { w: 250, h: 25, unit: 'mm', dpi: 203, label: 'Wristband' },
  },

  report: {
    /** A4 portrait */
    a4: { w: 210, h: 297, unit: 'mm', dpi: 150, label: 'A4 Report' },
    /** US Letter portrait */
    letter: { w: 215.9, h: 279.4, unit: 'mm', dpi: 150, label: 'Letter Report' },
    /** Half-page summary card */
    half: { w: 148, h: 210, unit: 'mm', dpi: 150, label: 'Half-Page Summary' },
  },

  badge: {
    /** Conference / name badge */
    conference: { w: 100, h: 140, unit: 'mm', dpi: 300, label: 'Conference Badge' },
    /** Lanyard card */
    lanyard: { w: 85.6, h: 135, unit: 'mm', dpi: 300, label: 'Lanyard Badge' },
    /** Adhesive label badge */
    sticker: { w: 64, h: 38, unit: 'mm', dpi: 300, label: 'Sticker Badge' },
  },

  menu: {
    /** Portrait A5 single-page menu */
    a5: { w: 148, h: 210, unit: 'mm', dpi: 150, label: 'A5 Menu' },
    /** Folded DL insert */
    dl: { w: 99, h: 210, unit: 'mm', dpi: 150, label: 'DL Menu' },
    /** Digital / screen menu (16:9) */
    screen: { w: 297, h: 167, unit: 'mm', dpi: 96, label: 'Screen Menu' },
  },

  flyer: {
    /** A5 portrait flyer */
    a5: { w: 148, h: 210, unit: 'mm', dpi: 300, label: 'A5 Flyer' },
    /** DL flyer (⅓ A4) */
    dl: { w: 99, h: 210, unit: 'mm', dpi: 300, label: 'DL Flyer' },
    /** Square social media post */
    social: { w: 130, h: 130, unit: 'mm', dpi: 300, label: 'Square Flyer' },
  },
};

/**
 * Default variant per docType.
 * @type {Record<string, string>}
 */
const DEFAULT_VARIANT = {
  card: 'cr80',
  ticket: 'standard',
  report: 'a4',
  badge: 'conference',
  menu: 'a5',
  flyer: 'a5',
};

/**
 * Retrieve a DocSize definition.
 *
 * @param {string} docType   - SmartDocument.docType (card|ticket|report|badge|menu|flyer)
 * @param {string} [variant] - size variant key; falls back to default for the docType
 * @returns {DocSize}
 */
export function getDocSize(docType, variant) {
  const group = DOC_SIZES[docType] ?? DOC_SIZES.card;
  const key = variant ?? DEFAULT_VARIANT[docType] ?? 'cr80';
  return group[key] ?? group[DEFAULT_VARIANT[docType]] ?? Object.values(group)[0];
}

/**
 * List available size variants for a given docType.
 *
 * @param {string} docType
 * @returns {Array<{ key: string } & DocSize>}
 */
export function listSizes(docType) {
  const group = DOC_SIZES[docType];
  if (!group) return [];
  return Object.entries(group).map(([key, size]) => ({ key, ...size }));
}
