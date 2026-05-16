/**
 * Shared draft failure error codes and recommended actions.
 * Used by draft failure mapping and GET draft response; dashboard uses these for UX.
 */

export const DraftErrorCode = {
  AUTH_REQUIRED_FOR_AI: 'AUTH_REQUIRED_FOR_AI',
  MISSING_PROVIDER_KEY: 'MISSING_PROVIDER_KEY',
  INSUFFICIENT_CREDITS: 'INSUFFICIENT_CREDITS',
  AI_IMAGE_CAP_EXCEEDED: 'AI_IMAGE_CAP_EXCEEDED',
  DRAFT_EXPIRED: 'DRAFT_EXPIRED',
  DRAFT_PROFILE_INVALID: 'DRAFT_PROFILE_INVALID',
  STORE_NOT_FOUND: 'STORE_NOT_FOUND',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  RATE_LIMITED: 'RATE_LIMITED',
  PROVIDER_ERROR: 'PROVIDER_ERROR',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
};

/** @type {Readonly<Record<string, string>>} */
export const RecommendedAction = {
  login: 'login',
  topup: 'topup',
  adjust: 'adjust',
  fixInput: 'fixInput',
  retry: 'retry',
  startOver: 'startOver',
};
