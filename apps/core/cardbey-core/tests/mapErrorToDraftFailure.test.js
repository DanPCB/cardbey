/**
 * Unit tests for mapErrorToDraftFailure (structured draft failure mapping).
 */
import { describe, it, expect } from 'vitest';
import { mapErrorToDraftFailure } from '../src/services/errors/mapErrorToDraftFailure.js';
import { DraftErrorCode, RecommendedAction } from '../src/services/errors/draftErrorCodes.js';

describe('mapErrorToDraftFailure', () => {
  it('maps AUTH_REQUIRED_FOR_AI to login', () => {
    const err = new Error('Authentication required to use paid AI');
    err.code = 'AUTH_REQUIRED_FOR_AI';
    err.status = 401;
    const out = mapErrorToDraftFailure(err);
    expect(out.errorCode).toBe(DraftErrorCode.AUTH_REQUIRED_FOR_AI);
    expect(out.recommendedAction).toBe(RecommendedAction.login);
    expect(out.errorMessage).toBeTruthy();
    expect(out.errorMessage.toLowerCase()).not.toContain('stack');
  });

  it('maps INSUFFICIENT_CREDITS to topup', () => {
    const err = new Error('Insufficient credits');
    err.code = 'INSUFFICIENT_CREDITS';
    err.status = 402;
    const out = mapErrorToDraftFailure(err);
    expect(out.errorCode).toBe(DraftErrorCode.INSUFFICIENT_CREDITS);
    expect(out.recommendedAction).toBe(RecommendedAction.topup);
  });

  it('maps AI_IMAGE_CAP_EXCEEDED to adjust', () => {
    const err = new Error('AI image count exceeds maximum');
    err.code = 'AI_IMAGE_CAP_EXCEEDED';
    err.status = 400;
    const out = mapErrorToDraftFailure(err);
    expect(out.errorCode).toBe(DraftErrorCode.AI_IMAGE_CAP_EXCEEDED);
    expect(out.recommendedAction).toBe(RecommendedAction.adjust);
  });

  it('maps random error to INTERNAL_ERROR with safe message and retry', () => {
    const err = new Error('Something broke at line 123\n  at foo (bar.js:1:1)');
    const out = mapErrorToDraftFailure(err);
    expect(out.errorCode).toBe(DraftErrorCode.INTERNAL_ERROR);
    expect(out.recommendedAction).toBe(RecommendedAction.retry);
    expect(out.errorMessage).toBeTruthy();
    expect(out.errorMessage).not.toContain('at line');
    expect(out.errorMessage).not.toContain('stack');
  });

  it('maps expired message to DRAFT_EXPIRED and startOver', () => {
    const err = new Error('Draft xyz has expired');
    const out = mapErrorToDraftFailure(err);
    expect(out.errorCode).toBe(DraftErrorCode.DRAFT_EXPIRED);
    expect(out.recommendedAction).toBe(RecommendedAction.startOver);
  });

  it('maps status 429 to RATE_LIMITED and retry', () => {
    const err = new Error('Too many requests');
    err.status = 429;
    const out = mapErrorToDraftFailure(err);
    expect(out.errorCode).toBe(DraftErrorCode.RATE_LIMITED);
    expect(out.recommendedAction).toBe(RecommendedAction.retry);
  });

  it('maps DRAFT_PROFILE_INVALID to retry with safe message', () => {
    const err = new Error('Profile generation produced invalid result');
    err.code = 'DRAFT_PROFILE_INVALID';
    const out = mapErrorToDraftFailure(err);
    expect(out.errorCode).toBe(DraftErrorCode.DRAFT_PROFILE_INVALID);
    expect(out.recommendedAction).toBe(RecommendedAction.retry);
    expect(out.errorMessage).toBeTruthy();
  });

  it('maps AI service not available / OPENAI_API_KEY message to MISSING_PROVIDER_KEY', () => {
    const err = new Error('AI service is not available. Please configure OPENAI_API_KEY.');
    const out = mapErrorToDraftFailure(err);
    expect(out.errorCode).toBe(DraftErrorCode.MISSING_PROVIDER_KEY);
    expect(out.recommendedAction).toBe(RecommendedAction.retry);
    expect(out.errorMessage).toContain('OPENAI_API_KEY');
  });

  it('maps code MISSING_PROVIDER_KEY', () => {
    const err = new Error('API key not configured');
    err.code = 'MISSING_PROVIDER_KEY';
    const out = mapErrorToDraftFailure(err);
    expect(out.errorCode).toBe(DraftErrorCode.MISSING_PROVIDER_KEY);
  });
});
