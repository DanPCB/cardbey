import { describe, expect, it } from 'vitest';
import {
  buildCreateStoreDraftIntakeResponseFromUpload,
  buildNeedsFormCreateStoreIntakeBody,
  resolveCreateStoreHandoffFields,
  shouldDeferStorePipelineExecutionForIntake,
  shouldForceCreateStoreCheckpointDispatch,
  shouldSkipDynamicPlannerForUploadCreateStore,
} from '../createStoreCheckpointDispatch.js';

describe('resolveCreateStoreHandoffFields', () => {
  it('prefers storeCreateForm over pill text', () => {
    const fields = resolveCreateStoreHandoffFields({
      storeCreateForm: {
        storeName: 'My Beauty',
        storeType: 'Beauty',
        location: 'Melbourne',
        intentMode: 'store',
      },
      userMessage: 'Other · Other · Sydney',
    });
    expect(fields).toEqual({
      businessName: 'My Beauty',
      businessType: 'Beauty',
      locationTrim: 'Melbourne',
      intentMode: 'store',
    });
  });

  it('parses pill message when form absent', () => {
    const fields = resolveCreateStoreHandoffFields({
      userMessage: 'Melbourne Flower · Other · Melbourne',
    });
    expect(fields.businessName).toBe('Melbourne Flower');
    expect(fields.locationTrim).toBe('Melbourne');
  });

  it('reads client cardExtraction from intentSourceContext', () => {
    const fields = resolveCreateStoreHandoffFields({
      userMessage: 'Create store from uploaded card',
      intentSourceContext: {
        cardExtraction: {
          businessName: 'PTH Construction',
          location: 'Melbourne',
          vertical: 'Construction',
        },
      },
    });
    expect(fields.businessName).toBe('PTH Construction');
    expect(fields.locationTrim).toBe('Melbourne');
    expect(fields.businessType).toBe('Construction');
  });
});

describe('shouldForceCreateStoreCheckpointDispatch', () => {
  it('returns true for structured form with _autoSubmit and store name', () => {
    expect(
      shouldForceCreateStoreCheckpointDispatch({
        classification: {
          tool: 'create_store',
          parameters: { _autoSubmit: true },
        },
        storeCreateForm: {
          storeName: 'My Cafe',
          storeType: 'Food & drink',
          location: 'Melbourne',
        },
      }),
    ).toBe(true);
  });

  it('returns false without _autoSubmit', () => {
    expect(
      shouldForceCreateStoreCheckpointDispatch({
        classification: { tool: 'create_store', parameters: {} },
        storeCreateForm: { storeName: 'My Cafe', location: 'Melbourne' },
      }),
    ).toBe(false);
  });

  it('returns false for add_product even with form envelope', () => {
    expect(
      shouldForceCreateStoreCheckpointDispatch({
        classification: { tool: 'add_product', parameters: { _autoSubmit: true } },
        storeCreateForm: { storeName: 'My Cafe' },
      }),
    ).toBe(false);
  });

  it('returns true when cardExtraction supplies business name', () => {
    expect(
      shouldForceCreateStoreCheckpointDispatch({
        classification: { tool: 'create_store', parameters: { _autoSubmit: true } },
        userMessage: 'Create store from uploaded card',
        intentSourceContext: {
          cardExtraction: { businessName: 'PTH Construction', location: 'Melbourne' },
        },
      }),
    ).toBe(true);
  });
});

describe('shouldSkipDynamicPlannerForUploadCreateStore', () => {
  it('skips planner for upload create_store without resolved business name', () => {
    expect(
      shouldSkipDynamicPlannerForUploadCreateStore({
        classification: { tool: 'create_store', parameters: { source: 'upload_ask_selection' } },
        userMessage: 'Create store from uploaded card',
        intentSourceContext: { fromAskSelection: 'create_store' },
      }),
    ).toBe(true);
  });

  it('does not skip when OCR supplies business name', () => {
    expect(
      shouldSkipDynamicPlannerForUploadCreateStore({
        classification: { tool: 'create_store', parameters: { _autoSubmit: true } },
        userMessage: 'Create store from uploaded card',
        intentSourceContext: {
          cardExtraction: { businessName: 'PTH Construction' },
        },
      }),
    ).toBe(false);
  });
});

describe('buildCreateStoreDraftIntakeResponseFromUpload', () => {
  it('returns storeCreationDraft for upload create_store selection', async () => {
    const body = await buildCreateStoreDraftIntakeResponseFromUpload({
      userMessage: 'Create store from uploaded card',
      intentSourceContext: {
        fromAskSelection: 'create_store',
        cardExtraction: {
          businessName: 'PTH Construction',
          location: 'Melbourne',
          vertical: 'Construction',
        },
      },
    });
    expect(body?.action).toBe('create_store');
    expect(body?.storeCreationDraft?.draft?.name).toBe('PTH Construction');
    expect(body?.missingFields).toBeDefined();
    expect(typeof body?.response).toBe('string');
  });
});

describe('buildNeedsFormCreateStoreIntakeBody', () => {
  it('returns unified draft bundle and intro copy for blank create store turns', () => {
    const body = buildNeedsFormCreateStoreIntakeBody({
      userMessage: 'Create store',
      intentMode: 'store',
    });
    expect(body.action).toBe('create_store');
    expect(body.storeCreationDraft?.missingFields).toEqual(['name', 'location', 'category']);
    expect(body.response).toContain("Let's set up your store");
  });
});

describe('shouldDeferStorePipelineExecutionForIntake', () => {
  it('defers for intake v2 sources', () => {
    expect(shouldDeferStorePipelineExecutionForIntake('intake_v2_fresh_store_draft')).toBe(true);
    expect(shouldDeferStorePipelineExecutionForIntake('intake_v2_classified_checkpoint')).toBe(true);
    expect(shouldDeferStorePipelineExecutionForIntake('intake_v2_unified')).toBe(true);
  });

  it('does not defer for non-intake runners', () => {
    expect(shouldDeferStorePipelineExecutionForIntake('proactive_runway_create_store')).toBe(false);
    expect(shouldDeferStorePipelineExecutionForIntake('')).toBe(false);
  });
});
