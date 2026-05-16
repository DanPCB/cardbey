/**
 * Map a thrown error to a structured draft failure: user-safe message + errorCode + recommendedAction.
 * Never throws; returns INTERNAL_ERROR with safe message if mapping fails.
 */

import { DraftErrorCode, RecommendedAction } from './draftErrorCodes.js';

const SAFE_MESSAGES = {
  [DraftErrorCode.AUTH_REQUIRED_FOR_AI]: 'Please sign in or create an account to use AI generation.',
  [DraftErrorCode.MISSING_PROVIDER_KEY]: 'AI provider is not configured. Set OPENAI_API_KEY in your environment.',
  [DraftErrorCode.INSUFFICIENT_CREDITS]: 'You don’t have enough credits. Top up or use your welcome offer.',
  [DraftErrorCode.AI_IMAGE_CAP_EXCEEDED]: 'Too many images requested. Reduce the number and try again.',
  [DraftErrorCode.DRAFT_EXPIRED]: 'This draft has expired. Please start over.',
  [DraftErrorCode.DRAFT_PROFILE_INVALID]: 'Profile generation failed. Please try again.',
  [DraftErrorCode.STORE_NOT_FOUND]: 'Store or draft not found. Please start over.',
  [DraftErrorCode.VALIDATION_ERROR]: 'Please check your input and try again.',
  [DraftErrorCode.RATE_LIMITED]: 'Too many requests. Please try again in a moment.',
  [DraftErrorCode.PROVIDER_ERROR]: 'A temporary service issue occurred. Please try again.',
  [DraftErrorCode.INTERNAL_ERROR]: 'Something went wrong. Please try again.',
};

function isSafeMessage(msg) {
  if (typeof msg !== 'string' || !msg.trim()) return false;
  const lower = msg.toLowerCase();
  return !lower.includes('at ') && !lower.includes('stack') && !lower.includes('prisma') && !lower.includes('sql');
}

/**
 * @param {Error | { code?: string, status?: number, message?: string }} err
 * @returns {{ errorMessage: string, errorCode: string, recommendedAction: string }}
 */
export function mapErrorToDraftFailure(err) {
  const rawMessage = err?.message != null ? String(err.message) : '';
  try {
    const code = err?.code;
    const status = err?.status ?? (err && typeof err === 'object' && 'status' in err ? err.status : undefined);

    if (code === 'AUTH_REQUIRED_FOR_AI') {
      return {
        errorMessage: isSafeMessage(rawMessage) ? rawMessage.trim() : SAFE_MESSAGES[DraftErrorCode.AUTH_REQUIRED_FOR_AI],
        errorCode: DraftErrorCode.AUTH_REQUIRED_FOR_AI,
        recommendedAction: RecommendedAction.login,
      };
    }
    if (code === 'MISSING_PROVIDER_KEY' || (rawMessage && /OPENAI_API_KEY|API key not configured|AI service is not available/i.test(rawMessage))) {
      return {
        errorMessage: SAFE_MESSAGES[DraftErrorCode.MISSING_PROVIDER_KEY],
        errorCode: DraftErrorCode.MISSING_PROVIDER_KEY,
        recommendedAction: RecommendedAction.retry,
      };
    }
    if (code === 'INSUFFICIENT_CREDITS') {
      return {
        errorMessage: isSafeMessage(rawMessage) ? rawMessage.trim() : SAFE_MESSAGES[DraftErrorCode.INSUFFICIENT_CREDITS],
        errorCode: DraftErrorCode.INSUFFICIENT_CREDITS,
        recommendedAction: RecommendedAction.topup,
      };
    }
    if (code === 'AI_IMAGE_CAP_EXCEEDED') {
      return {
        errorMessage: isSafeMessage(rawMessage) ? rawMessage.trim() : SAFE_MESSAGES[DraftErrorCode.AI_IMAGE_CAP_EXCEEDED],
        errorCode: DraftErrorCode.AI_IMAGE_CAP_EXCEEDED,
        recommendedAction: RecommendedAction.adjust,
      };
    }
    if (code === 'DRAFT_EXPIRED' || (rawMessage && /expired/i.test(rawMessage))) {
      return {
        errorMessage: SAFE_MESSAGES[DraftErrorCode.DRAFT_EXPIRED],
        errorCode: DraftErrorCode.DRAFT_EXPIRED,
        recommendedAction: RecommendedAction.startOver,
      };
    }
    if (code === 'DRAFT_PROFILE_INVALID') {
      return {
        errorMessage: SAFE_MESSAGES[DraftErrorCode.DRAFT_PROFILE_INVALID],
        errorCode: DraftErrorCode.DRAFT_PROFILE_INVALID,
        recommendedAction: RecommendedAction.retry,
      };
    }
    if (code === 'STORE_NOT_FOUND' || (rawMessage && /not found|draft_not_found/i.test(rawMessage))) {
      return {
        errorMessage: SAFE_MESSAGES[DraftErrorCode.STORE_NOT_FOUND],
        errorCode: DraftErrorCode.STORE_NOT_FOUND,
        recommendedAction: RecommendedAction.startOver,
      };
    }
    if (code === 'insufficient_quota' || (rawMessage && /exceeded your current quota|insufficient_quota/i.test(rawMessage))) {
      return {
        errorMessage: 'OpenAI quota exceeded. Add billing at platform.openai.com or try again later.',
        errorCode: DraftErrorCode.RATE_LIMITED,
        recommendedAction: RecommendedAction.retry,
      };
    }
    if (status === 429 || code === 'RATE_LIMITED' || (rawMessage && /rate limit|throttl/i.test(rawMessage))) {
      return {
        errorMessage: SAFE_MESSAGES[DraftErrorCode.RATE_LIMITED],
        errorCode: DraftErrorCode.RATE_LIMITED,
        recommendedAction: RecommendedAction.retry,
      };
    }
    if (status === 400 || code === 'VALIDATION_ERROR' || (rawMessage && /valid|required|missing/i.test(rawMessage) && !rawMessage.includes('Authentication'))) {
      return {
        errorMessage: isSafeMessage(rawMessage) ? rawMessage.trim() : SAFE_MESSAGES[DraftErrorCode.VALIDATION_ERROR],
        errorCode: DraftErrorCode.VALIDATION_ERROR,
        recommendedAction: RecommendedAction.fixInput,
      };
    }
    if (status >= 500 || (rawMessage && /timeout|econnreset|provider|openai|api/i.test(rawMessage))) {
      return {
        errorMessage: SAFE_MESSAGES[DraftErrorCode.PROVIDER_ERROR],
        errorCode: DraftErrorCode.PROVIDER_ERROR,
        recommendedAction: RecommendedAction.retry,
      };
    }
  } catch (_) {
    // fall through to INTERNAL_ERROR
  }
  // Surface the real error when safe (no stack/sql/prisma) so users and logs can diagnose INTERNAL_ERROR
  const safeFallback = isSafeMessage(rawMessage) ? rawMessage.trim() : SAFE_MESSAGES[DraftErrorCode.INTERNAL_ERROR];
  return {
    errorMessage: safeFallback,
    errorCode: DraftErrorCode.INTERNAL_ERROR,
    recommendedAction: RecommendedAction.retry,
  };
}
