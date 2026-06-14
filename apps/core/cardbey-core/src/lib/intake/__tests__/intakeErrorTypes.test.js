import { describe, expect, it } from 'vitest';
import {
  StoreCreationError,
  formatDuplicateStoreIntakeResponse,
  formatErrorResponse,
  formatValidationErrorResponse,
  validateStoreCreationFields,
} from '../intakeErrorTypes.js';

describe('intakeErrorTypes', () => {
  it('formats duplicate store with suggestion', () => {
    const body = formatDuplicateStoreIntakeResponse('Joe Coffee');
    expect(body.action).toBe('duplicate_store');
    expect(body.error).toBe('DUPLICATE_STORE');
    expect(body.message).toContain('Joe Coffee');
    expect(body.suggestion).toMatch(/Melbourne/i);
    expect(body.errorAction).toBe('CHOOSE_DIFFERENT_NAME');
  });

  it('formatErrorResponse resolves MISSING_NAME', () => {
    const out = formatErrorResponse('MISSING_NAME');
    expect(out.error).toBe('MISSING_NAME');
    expect(out.message).toBe(StoreCreationError.MISSING_NAME.userMessage);
    expect(out.errorAction).toBe('FOCUS_NAME_FIELD');
  });

  it('validateStoreCreationFields returns structured errors', () => {
    const errors = validateStoreCreationFields({
      storeCreateForm: { storeName: '', location: '', storeType: '' },
    });
    expect(errors.some((e) => e.code === 'MISSING_NAME')).toBe(true);
    expect(errors.some((e) => e.code === 'MISSING_LOCATION')).toBe(true);
    expect(errors.some((e) => e.code === 'MISSING_CATEGORY')).toBe(true);
  });

  it('formatValidationErrorResponse wraps field errors', () => {
    const errors = validateStoreCreationFields({
      storeCreateForm: { storeName: 'A', location: 'Melbourne', storeType: 'Other' },
    });
    const body = formatValidationErrorResponse(errors);
    expect(body.action).toBe('validation_error');
    expect(body.errors?.length).toBeGreaterThan(0);
    expect(body.error).toBe('MISSING_NAME');
  });
});
