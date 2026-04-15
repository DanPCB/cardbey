/**
 * PAG or PPS tier policy — conservative; same runway only.
 */

import type { PremiumRoutingDecision, PremiumUsageMode } from './types.ts';
import { defaultPremiumDecision } from './policyGuards.ts';

export interface PremiumRoutingInput {
  isGuest: boolean;
  hasCriticalGap?: boolean;
  userRequestedPremium?: boolean;
}

export function decidePremiumRouting(input: PremiumRoutingInput): PremiumRoutingDecision {
  if (input.userRequestedPremium && !input.isGuest) {
    return {
      allowed: true,
      mode: 'user_selected_premium',
      recommended: true,
      reason: 'user_explicit_premium',
    };
  }
  if (input.hasCriticalGap && !input.isGuest) {
    return {
      allowed: true,
      mode: 'suggest_premium',
      recommended: false,
      reason: 'critical_gap_premium_optional',
    };
  }
  return defaultPremiumDecision(input.isGuest);
}

export function isPremiumApprovalRequired(mode: PremiumUsageMode): boolean {
  return mode === 'user_selected_premium' || mode === 'auto_premium_with_limit';
}
