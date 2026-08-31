/**
 * Truthful Cardbey capability claims for marketing copy validation.
 * Do not invent live Meta verification or finished-product claims.
 */

import { POSITIONING_THEMES } from './constants.js';

/**
 * @returns {import('./types.js').CardbeyCapabilityRegistry}
 */
export function getCardbeyCapabilityRegistry() {
  return {
    productName: 'Cardbey',
    positioning: 'AI business creation platform under development',
    status: 'under_development',
    languages: {
      initial: ['en', 'vi'],
      note: 'English and Vietnamese are the initial supported languages for the pilot.',
    },
    approvedThemes: [...POSITIONING_THEMES],
    allowedClaims: [
      'Cardbey is an AI business creation platform under development.',
      'We are running an early Vietnamese SME pilot.',
      'Build Cardbey with us — early access / pilot participation.',
      'Initial languages: English and Vietnamese.',
      'Features are staged behind flags; live social publishing is not enabled by default.',
    ],
    blockedClaims: [
      'Fully finished / production-complete autonomous platform',
      'Guaranteed revenue, ROI, or sales results',
      'Worldwide / global availability today',
      'Fabricated testimonials or user counts',
      'Official Meta partner / live-verified Facebook operator (unless independently true)',
      'Fully autonomous marketing with no human approval',
    ],
    readiness: {
      foundationReady: true,
      liveMetaVerified: false,
      livePublishingDefault: false,
      responseSendingDefault: false,
      note: 'Foundation ready for drafting, approval, and mock publish. NOT live Meta verified.',
    },
    authority: {
      humanApprovalRequired: true,
      llmNeverReceivesTokens: true,
      autonomyDefaultOff: true,
    },
  };
}

export default getCardbeyCapabilityRegistry;
