import { describe, expect, it } from 'vitest';
import { FactBuilder } from '../factBuilder.js';
import { FACT_TYPES, StructuredFact } from '../factTypes.js';
import { buildIntakePayloadFromFact } from '../intakeFactResponse.js';
import { ACTION_CTA_LABELS, actionKeysToCtaLabels } from '../performerExplainer.js';

describe('StructuredFact', () => {
  it('serializes to JSON', () => {
    const fact = FactBuilder.duplicateStore('store-1', 'ABC Bakery');
    const json = fact.toJSON();
    expect(json.event).toBe(FACT_TYPES.ENTITY_CONFLICT);
    expect(json.data.existingEntity).toEqual({ id: 'store-1', name: 'ABC Bakery' });
    expect(json.allowedActions).toContain('open_existing');
  });
});

describe('FactBuilder', () => {
  it('builds store mission started fact', () => {
    const fact = FactBuilder.storeMissionStarted({
      missionId: 'm-1',
      storeName: 'XYZ Cafe',
      intentMode: 'store',
      businessType: 'Food & drink',
      location: 'Melbourne',
    });
    expect(fact.event).toBe(FACT_TYPES.ACTION_SUCCEEDED);
    expect(fact.reason).toBe('store_mission_started');
    expect(fact.data.missionId).toBe('m-1');
  });

  it('builds validation error fact', () => {
    const fact = FactBuilder.validationError([{ field: 'location', message: 'Location is required' }]);
    expect(fact.event).toBe(FACT_TYPES.VALIDATION_ERROR);
    expect(fact.data.fields).toHaveLength(1);
  });
});

describe('buildIntakePayloadFromFact', () => {
  it('includes fact and actions without hardcoded response when explanation is null', () => {
    const fact = FactBuilder.duplicateStore('store-1', 'ABC Bakery');
    const payload = buildIntakePayloadFromFact(fact, { explanation: null }, {
      success: true,
      action: 'duplicate_store',
    });
    expect(payload.fact?.event).toBe('entity_conflict');
    expect(payload.actions).toContain('open_existing');
    expect(payload.response).toBeUndefined();
    expect(payload.ctaButtons).toEqual(actionKeysToCtaLabels(fact.allowedActions));
  });

  it('maps explanation to response for legacy consumers', () => {
    const fact = FactBuilder.storeCreated('store-2', 'XYZ Cafe');
    const payload = buildIntakePayloadFromFact(
      fact,
      { explanation: 'Your store is ready.' },
      { success: true, action: 'store_created' },
    );
    expect(payload.explanation).toBe('Your store is ready.');
    expect(payload.response).toBe('Your store is ready.');
  });
});

describe('actionKeysToCtaLabels', () => {
  it('maps known action keys to labels', () => {
    expect(ACTION_CTA_LABELS.open_existing).toBe('Open existing store');
    expect(actionKeysToCtaLabels(['open_existing', 'edit_details'])).toEqual([
      'Open existing store',
      'Edit details',
    ]);
  });
});
