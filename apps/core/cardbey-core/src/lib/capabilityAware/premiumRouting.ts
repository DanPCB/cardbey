/**
 * Premium routing is policy-only in v1.
 */

import type {
  CapabilityDefinition,
  PerformerRole,
  PremiumRoutingDecision,
  PremiumUsageMode,
} from './types.ts';

export function decidePremiumRouting(
  capability: CapabilityDefinition,
  policy: PremiumUsageMode,
  role: PerformerRole,
): PremiumRoutingDecision {
  void role;

  if (policy === 'standard_only') {
    return {
      allowed: false,
      mode: policy,
      recommended: false,
      reason: 'standard only policy active',
    };
  }

  if (policy === 'suggest_premium') {
    if (capability.tier === 'premium') {
      return {
        allowed: false,
        mode: policy,
        recommended: true,
        reason: 'premium available — user approval needed',
      };
    }
    return {
      allowed: false,
      mode: policy,
      recommended: false,
      reason: 'standard capability',
    };
  }

  if (policy === 'user_selected_premium') {
    if (capability.tier === 'premium') {
      return {
        allowed: true,
        mode: policy,
        recommended: true,
        reason: 'user selected premium',
      };
    }
    return {
      allowed: true,
      mode: policy,
      recommended: false,
      reason: 'standard selected',
    };
  }

  return {
    allowed: false,
    mode: policy,
    recommended: false,
    reason: 'auto premium not available in v1',
  };
}

export function isPremiumApprovalRequired(decision: PremiumRoutingDecision): boolean {
  return decision.recommended === true && decision.allowed === false;
}

export function getDefaultPremiumPolicy(role: PerformerRole): PremiumUsageMode {
  void role;
  return 'suggest_premium';
}
