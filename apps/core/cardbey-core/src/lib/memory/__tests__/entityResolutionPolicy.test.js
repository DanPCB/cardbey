import { describe, expect, it } from 'vitest';
import {
  entityTypesRequiredForTool,
  filterResolutionErrorsForEntityTypes,
  isStoreCreationSessionContext,
  shouldResolveMessageEntitiesAfterClassification,
} from '../entityResolutionPolicy.js';

describe('entityResolutionPolicy', () => {
  it('detects store creation session from storeCreateForm', () => {
    expect(
      isStoreCreationSessionContext({
        storeCreateForm: { storeName: 'My Beauty', storeType: 'Beauty', location: 'Melbourne' },
      }),
    ).toBe(true);
  });

  it('skips message entity resolution for create_store classification', () => {
    expect(
      shouldResolveMessageEntitiesAfterClassification(
        { tool: 'create_store', executionPath: 'proactive_plan' },
        {},
      ),
    ).toBe(false);
  });

  it('allows resolution for product-oriented tools after classification', () => {
    expect(
      shouldResolveMessageEntitiesAfterClassification(
        { tool: 'update_product', executionPath: 'direct_action' },
        {},
      ),
    ).toBe(true);
  });

  it('filters product errors when only store entity is required', () => {
    const allowed = entityTypesRequiredForTool(
      'update_store_hero',
      { requiresStore: true, parameterSchema: { required: ['storeId'] } },
      ['storeId'],
    );
    const filtered = filterResolutionErrorsForEntityTypes(
      [
        { entityType: 'product', ref: 'My Beauty', reason: 'NOT_FOUND' },
        {
          entityType: 'store',
          ref: 'my cafe',
          reason: 'AMBIGUOUS',
          candidates: [{ id: 'a', name: 'Alpha' }],
        },
      ],
      allowed,
    );
    expect(filtered).toHaveLength(1);
    expect(filtered[0].entityType).toBe('store');
  });
});
