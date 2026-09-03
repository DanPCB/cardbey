import { describe, it, expect } from 'vitest';
import {
  OCR_RESULT_CLASS,
  classifyOcrProviderError,
  classifyOcrTextResult,
  isRecoverableProviderFailure,
} from '../src/lib/ocr/ocrProviderFailure.js';

describe('ocrProviderFailure', () => {
  it('classifies quota / credit exhaustion', () => {
    expect(classifyOcrProviderError(new Error('insufficient_quota'))).toBe(
      OCR_RESULT_CLASS.QUOTA_EXHAUSTED,
    );
    expect(classifyOcrProviderError(new Error('credit_balance_exhausted'))).toBe(
      OCR_RESULT_CLASS.QUOTA_EXHAUSTED,
    );
  });

  it('classifies 429 as rate limited when not quota-worded', () => {
    const err = new Error('Too Many Requests');
    err.status = 429;
    expect(classifyOcrProviderError(err)).toBe(OCR_RESULT_CLASS.RATE_LIMITED);
  });

  it('classifies timeout and network', () => {
    expect(classifyOcrProviderError(new Error('OCR timeout'))).toBe(OCR_RESULT_CLASS.TIMEOUT);
    expect(classifyOcrProviderError(new Error('fetch failed'))).toBe(OCR_RESULT_CLASS.NETWORK_ERROR);
  });

  it('classifies empty vs success text', () => {
    expect(classifyOcrTextResult('')).toBe(OCR_RESULT_CLASS.EMPTY_RESULT);
    expect(classifyOcrTextResult('HP Services\n0412')).toBe(OCR_RESULT_CLASS.SUCCESS);
  });

  it('marks quota as recoverable', () => {
    expect(isRecoverableProviderFailure(OCR_RESULT_CLASS.QUOTA_EXHAUSTED)).toBe(true);
    expect(isRecoverableProviderFailure(OCR_RESULT_CLASS.SUCCESS)).toBe(false);
  });
});
