import { describe, expect, it, vi } from 'vitest';
import {
  buildCreateStoreDraftIntakeResponseFromUpload,
  buildNeedsFormCreateStoreIntakeBody,
  dispatchCreateStoreCheckpointPipeline,
  resolveCreateStoreHandoffFields,
  shouldDeferStorePipelineExecutionForIntake,
  shouldForceCreateStoreCheckpointDispatch,
  shouldSkipDynamicPlannerForUploadCreateStore,
} from '../createStoreCheckpointDispatch.js';

vi.mock('../accountStoreIntakeGate.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    loadAccountStoreContext: vi.fn(async () => ({
      accountHasStores: true,
      storeCount: 2,
      stores: [
        { id: 's1', name: 'Pho Chu The', type: 'Food & drink' },
        { id: 's2', name: 'ABC Bakery', type: 'Food & drink' },
      ],
    })),
  };
});

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
      websiteTemplateId: '',
      websiteTemplateSlug: '',
      websiteUrl: '',
      phone: '',
      email: '',
      ocrText: '',
    });
  });

  it('forwards website/phone/email from storeCandidate', () => {
    const fields = resolveCreateStoreHandoffFields({
      userMessage: 'Create store from upload',
      intentSourceContext: {
        storeCandidate: {
          businessName: 'Glamshell Beauty',
          location: 'Melbourne',
          category: 'Beauty',
          website: 'https://glamshell.example',
          phone: '+61 400 000 000',
          email: 'hello@glamshell.example',
        },
      },
    });
    expect(fields.businessName).toBe('Glamshell Beauty');
    expect(fields.websiteUrl).toBe('https://glamshell.example');
    expect(fields.phone).toMatch(/61400000000|\+61400000000/);
    expect(fields.email).toBe('hello@glamshell.example');
  });

  it('forwards websiteUrl from storeCreateForm', () => {
    const fields = resolveCreateStoreHandoffFields({
      storeCreateForm: {
        storeName: 'Cafe Co',
        storeType: 'Cafe',
        location: 'Sydney',
        websiteUrl: 'cafeco.example',
        phone: '0299998888',
      },
    });
    expect(fields.websiteUrl).toBe('https://cafeco.example');
    expect(fields.phone).toBeTruthy();
  });

  it('parses pill message when form absent', () => {
    const fields = resolveCreateStoreHandoffFields({
      userMessage: 'Melbourne Flower · Other · Melbourne',
    });
    expect(fields.businessName).toBe('Melbourne Flower');
    expect(fields.locationTrim).toBe('Melbourne');
  });

  it('reads websiteTemplateId from classification parameters', () => {
    const fields = resolveCreateStoreHandoffFields({
      storeCreateForm: {
        storeName: 'Spa Co',
        storeType: 'Beauty',
        location: 'Melbourne',
      },
      classification: {
        parameters: {
          websiteTemplateId: 'tpl_beauty_1',
          baseWebsiteTemplateSlug: 'beauty-wellness-website',
        },
      },
    });
    expect(fields.websiteTemplateId).toBe('tpl_beauty_1');
    expect(fields.websiteTemplateSlug).toBe('beauty-wellness-website');
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

describe('dispatchCreateStoreCheckpointPipeline account store gate', () => {
  it('returns intake_chat for vague create_store mis-route on multi-store account', async () => {
    const result = await dispatchCreateStoreCheckpointPipeline({
      res: {},
      prisma: {},
      user: { id: 'user-1' },
      actorId: 'user-1',
      locale: 'en',
      userMessage: 'sdfad',
      cardbeyTraceId: 'trace-1',
      auditSource: 'test',
      storeCreateForm: null,
      classification: { tool: 'create_store', parameters: { source: 'needs_form' } },
      safeJson: async () => null,
      formatDuplicateResponse: () => ({}),
      createMissionPipeline: async () => ({ handled: false }),
    });

    expect(result.kind).toBe('intake_chat');
  });

  it('returns store_selection_required for store-scoped intent without active store', async () => {
    const result = await dispatchCreateStoreCheckpointPipeline({
      res: {},
      prisma: {},
      user: { id: 'user-1' },
      actorId: 'user-1',
      locale: 'en',
      userMessage: 'add product',
      cardbeyTraceId: 'trace-1',
      auditSource: 'test',
      storeCreateForm: null,
      classification: { tool: 'replace_store_catalog', parameters: {} },
      safeJson: async () => null,
      formatDuplicateResponse: () => ({}),
      createMissionPipeline: async () => ({ handled: false }),
    });

    expect(result.kind).toBe('store_selection_required');
    expect(result.stores?.length).toBe(2);
  });

  it('still returns needs_form for explicit create store message', async () => {
    const result = await dispatchCreateStoreCheckpointPipeline({
      res: {},
      prisma: {},
      user: { id: 'user-1' },
      actorId: 'user-1',
      locale: 'en',
      userMessage: 'Create a new store in Sydney',
      cardbeyTraceId: 'trace-1',
      auditSource: 'test',
      storeCreateForm: null,
      classification: { tool: 'create_store', parameters: { source: 'intent_reasoning' } },
      safeJson: async () => null,
      formatDuplicateResponse: () => ({}),
      createMissionPipeline: async () => ({ handled: false }),
    });

    expect(result.kind).toBe('needs_form');
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
