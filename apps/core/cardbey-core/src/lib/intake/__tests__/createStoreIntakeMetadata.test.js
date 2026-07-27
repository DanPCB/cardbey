import { describe, expect, it } from 'vitest';
import { detectCapabilityGap } from '../intakeCapabilityGap.js';
import {
  CREATE_STORE_INTAKE_SOURCE_VALUES,
  findUnknownStoreCreateFormFields,
  validateCreateStoreIntakeSource,
} from '../createStoreIntakeMetadata.js';
import { validateCreateStorePayload } from '../intakeSystemShortcuts.js';

describe('createStoreIntakeMetadata', () => {
  it('allows known intake source values', () => {
    for (const source of CREATE_STORE_INTAKE_SOURCE_VALUES) {
      expect(validateCreateStoreIntakeSource(source)).toBeNull();
    }
  });

  it('rejects malformed intake source safely', () => {
    const err = validateCreateStoreIntakeSource('not_a_real_source');
    expect(err?.field).toBe('source');
    expect(err?.reason).toBe('invalid_intake_source');
  });

  it('rejects unknown storeCreateForm business fields', () => {
    expect(
      findUnknownStoreCreateFormFields({
        storeName: 'ABC Bakery',
        location: 'Melbourne',
        storeType: 'Food & drink',
        evilField: 'x',
      }),
    ).toEqual(['evilField']);
    const errors = validateCreateStorePayload({
      storeCreateForm: {
        storeName: 'ABC Bakery',
        location: 'Melbourne',
        storeType: 'Food & drink',
        evilField: 'x',
      },
    });
    expect(errors.some((e) => e.field === 'storeCreateForm.evilField')).toBe(true);
  });

  it('does not trigger capability gap for intake metadata unknown_field on create_store', async () => {
    const gap = await detectCapabilityGap({
      userMessage: 'Create store: ABC Bakery · Food & drink · Melbourne',
      classification: { tool: 'create_store', executionPath: 'proactive_plan' },
      validationErrors: [{ field: 'source', reason: 'unknown_field' }],
    });
    expect(gap.isGap).toBe(false);
    expect(gap.reason).toBe('create_store_registered_tool');
  });

  it('still triggers capability gap for real unknown business fields', async () => {
    const gap = await detectCapabilityGap({
      userMessage: 'Create a new custom loyalty widget section for my store please',
      classification: { tool: 'general_chat', executionPath: 'chat' },
      validationErrors: [{ field: 'loyaltyWidget', reason: 'unknown_field' }],
    });
    expect(gap.isGap).toBe(true);
    expect(gap.reason).toBe('strict_validation_unknown_field');
  });
});
