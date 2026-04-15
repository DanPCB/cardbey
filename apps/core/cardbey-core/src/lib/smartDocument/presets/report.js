/**
 * SmartDocument preset — Report (CC-2)
 *
 * Default configuration for business reports, summaries, and informational documents.
 */

import { getDocSize } from '../documentSizeStandards.js';

/**
 * @typedef {import('../documentSizeStandards.js').DocSize} DocSize
 */

/**
 * @typedef {{
 *   docType: 'report',
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
 * }} ReportPreset
 */

/** @type {Record<string, ReportPreset>} */
const REPORT_PRESETS = {
  business: {
    docType: 'report',
    subtype: 'business',
    ...sizeFields(getDocSize('report', 'a4')),
    capabilities: ['chat', 'feedback_form', 'download_asset'],
    agentPersonality: 'analytical business intelligence assistant',
    autoApprove: true,
    phaseConfig: {},
    designJson: { template: 'business_report', theme: 'corporate' },
  },

  summary: {
    docType: 'report',
    subtype: 'summary',
    ...sizeFields(getDocSize('report', 'half')),
    capabilities: ['chat', 'capture_lead'],
    agentPersonality: 'concise executive summary assistant',
    autoApprove: true,
    phaseConfig: {},
    designJson: { template: 'summary_report', theme: 'clean' },
  },

  invoice: {
    docType: 'report',
    subtype: 'invoice',
    ...sizeFields(getDocSize('report', 'a4')),
    capabilities: ['chat', 'collect_signature', 'download_asset'],
    agentPersonality: 'professional billing and invoice assistant',
    autoApprove: false,
    phaseConfig: {},
    designJson: { template: 'invoice', theme: 'minimal' },
  },

  proposal: {
    docType: 'report',
    subtype: 'proposal',
    ...sizeFields(getDocSize('report', 'a4')),
    capabilities: ['chat', 'collect_signature', 'feedback_form', 'capture_lead'],
    agentPersonality: 'persuasive and informative proposal assistant',
    autoApprove: true,
    phaseConfig: {},
    designJson: { template: 'proposal', theme: 'professional' },
  },

  menu_pdf: {
    docType: 'report',
    subtype: 'menu_pdf',
    ...sizeFields(getDocSize('report', 'a4')),
    capabilities: ['chat', 'capture_lead', 'feedback_form'],
    agentPersonality: 'welcoming menu and ordering assistant',
    autoApprove: true,
    phaseConfig: {},
    designJson: { template: 'menu_pdf', theme: 'warm' },
  },
};

/**
 * Retrieve a report preset by subtype.
 * Falls back to 'business' if subtype is not recognised.
 *
 * @param {string} [subtype]
 * @returns {ReportPreset}
 */
export function getReportPreset(subtype) {
  return REPORT_PRESETS[subtype ?? 'business'] ?? REPORT_PRESETS.business;
}

/** @returns {string[]} All supported report subtypes */
export function reportSubtypes() {
  return Object.keys(REPORT_PRESETS);
}

// ── Helpers ────────────────────────────────────────────────────────────────

/** @param {DocSize} size */
function sizeFields(size) {
  return { sizeW: size.w, sizeH: size.h, sizeUnit: size.unit, sizeDpi: size.dpi };
}
