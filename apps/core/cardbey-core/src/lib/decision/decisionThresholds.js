/**
 * Decision loop thresholds (Phase 3).
 */

import { Features } from '../../config/features.js';

export function getDecisionThresholds() {
  return {
    tLow: Features.decisionLoop.thresholds.low,
    tMargin: Features.decisionLoop.thresholds.margin,
  };
}
