import { OWNER_VERIFIED_STATUS } from './providerTypes.js';

export function resolveOwnerVerificationStatus({
  ownerVerifiedStatus,
  conflict = false,
  sourceType,
  confidence,
} = {}) {
  if (ownerVerifiedStatus) return ownerVerifiedStatus;
  if (conflict) return OWNER_VERIFIED_STATUS.NEEDS_OWNER_REVIEW;
  if (sourceType === 'ai_generated') return OWNER_VERIFIED_STATUS.PENDING;
  if (typeof confidence === 'number' && confidence < 0.55) return OWNER_VERIFIED_STATUS.NEEDS_OWNER_REVIEW;
  return OWNER_VERIFIED_STATUS.PENDING;
}
