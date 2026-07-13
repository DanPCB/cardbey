/**
 * Creator auto-approval policy foundation (release one: disabled).
 */

import { AUTO_PUBLISH_ENABLED } from './creatorPublishingTypes.js';

/**
 * @param {object} classification
 */
export function evaluateAutoApprovalEligibility(classification) {
  const result = classification?.resultJson ?? classification ?? {};
  const confidence = Number(result.confidence ?? classification?.confidence ?? 0);
  const overallRisk = result.risk?.overall ?? 'MEDIUM';
  const copyrightRisk = Number(result.risk?.copyright ?? 0.5);
  const creatorTrust = Number(result.creatorContext?.trustScore ?? 0.5);

  const wouldQualify =
    confidence >= 0.95 &&
    overallRisk === 'LOW' &&
    copyrightRisk <= 0.2 &&
    creatorTrust >= 0.7;

  return {
    autoPublishEnabled: AUTO_PUBLISH_ENABLED,
    wouldQualifyForFutureAutoApproval: wouldQualify,
    confidence,
    overallRisk,
    copyrightRisk,
    creatorTrust,
  };
}

export { AUTO_PUBLISH_ENABLED };
