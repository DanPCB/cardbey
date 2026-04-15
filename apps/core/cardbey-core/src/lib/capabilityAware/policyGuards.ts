/**
 * Pure policy helpers — never override stronger route/auth checks.
 */

import type { CapabilityDefinition, PremiumRoutingDecision, PremiumUsageMode } from './types.ts';

export function canGuestUseCapability(cap: CapabilityDefinition | undefined): boolean {
  if (!cap) return false;
  return cap.supportsGuest === true && !cap.requiresApproval;
}

export function canInvokePremiumSuggested(isGuest: boolean, _role: string): boolean {
  if (isGuest) return false;
  return true;
}

export function isChildAgentRecommendationAllowed(isGuest: boolean, cap: CapabilityDefinition | undefined): boolean {
  if (isGuest) return false;
  if (!cap) return false;
  return cap.riskLevel !== 'high';
}

export function requiresPremiumApproval(mode: PremiumUsageMode): boolean {
  return mode === 'user_selected_premium' || mode === 'auto_premium_with_limit';
}

/** Conservative default — no auto premium in v1. */
export function defaultPremiumDecision(isGuest: boolean): PremiumRoutingDecision {
  if (isGuest) {
    return {
      allowed: false,
      mode: 'standard_only',
      recommended: false,
      reason: 'guest_standard_only',
    };
  }
  return {
    allowed: true,
    mode: 'suggest_premium',
    recommended: false,
    reason: 'premium_opt_in_only_v1',
  };
}
