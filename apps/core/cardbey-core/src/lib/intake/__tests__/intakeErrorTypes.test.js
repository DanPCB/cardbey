import { describe, expect, it } from 'vitest';
import {
  StoreCreationError,
  canonicalizeCreateStoreCategory,
  formatDuplicateStoreIntakeResponse,
  formatErrorResponse,
  formatValidationErrorResponse,
  validateStoreCreationFields,
} from '../intakeErrorTypes.js';

describe('intakeErrorTypes', () => {
  it('formats duplicate store with structured fact and open-existing actions', () => {
    const body = formatDuplicateStoreIntakeResponse('ABC Bakery', {
      id: 'store-abc',
      name: 'ABC Bakery',
    });
    expect(body.action).toBe('duplicate_store');
    expect(body.error).toBe('DUPLICATE_STORE');
    expect(body.fact?.event).toBe('entity_conflict');
    expect(body.fact?.reason).toBe('duplicate_name');
    expect(body.existingStoreId).toBe('store-abc');
    expect(body.ctaButtons).toContain('Open existing store');
    expect(body.errorAction).toBe('OPEN_EXISTING_STORE');
    expect(body.response).toBeUndefined();
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

  it('canonicalizeCreateStoreCategory maps OCR free-text to picker labels', () => {
    expect(canonicalizeCreateStoreCategory('Greek street food')).toBe('Food & drink');
    expect(canonicalizeCreateStoreCategory('handyman')).toBe('Home & garden');
    expect(canonicalizeCreateStoreCategory('Food & drink')).toBe('Food & drink');
    expect(canonicalizeCreateStoreCategory('Construction')).toBe('Home & garden');
    expect(canonicalizeCreateStoreCategory('massage')).toBe('Beauty');
    expect(canonicalizeCreateStoreCategory('beauty salon')).toBe('Beauty');
    expect(canonicalizeCreateStoreCategory('Vietnamese restaurant')).toBe('Food & drink');
  });

  it('validateStoreCreationFields accepts OCR free-text categories after canonicalize', () => {
    const errors = validateStoreCreationFields({
      storeCreateForm: {
        storeName: 'MAMOS',
        location: 'Melbourne',
        storeType: 'Greek street food',
      },
    });
    expect(errors).toEqual([]);
  });

  it('formatValidationErrorResponse wraps field errors with structured fact', () => {
    const errors = validateStoreCreationFields({
      storeCreateForm: { storeName: 'A', location: 'Melbourne', storeType: 'Other' },
    });
    const body = formatValidationErrorResponse(errors);
    expect(body.action).toBe('validation_error');
    expect(body.errors?.length).toBeGreaterThan(0);
    expect(body.error).toBe('MISSING_NAME');
    expect(body.fact?.event).toBe('validation_error');
    expect(body.actions).toContain('edit_details');
  });
});
