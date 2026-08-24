/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import {
  applyIntakePayloadGuard,
  estimateJsonBytes,
  isFreshStoreCreationMission,
  normalizeCreateStoreFromUploadBody,
  normalizeFreshStoreCreationBody,
  seedStoreCreateFormFromUploadContext,
} from '../intakePayloadGuard.js';
import { shouldSkipUploadAskForIntakeSelectionReplay } from '../intakeReplayPayload.js';

describe('intakePayloadGuard', () => {
  it('detects fresh store creation mission', () => {
    expect(
      isFreshStoreCreationMission({
        freshStoreMission: true,
        intent: 'create_store',
        source: 'store_creation_draft',
        _autoSubmit: true,
      }),
    ).toBe(true);
  });

  it('normalizes fresh store body to slim contract', () => {
    const heavy = {
      message: 'Create store: ABC · Food · Melbourne',
      intent: 'create_store',
      source: 'store_creation_draft',
      _autoSubmit: true,
      freshStoreMission: true,
      unifiedMemory: { stores: [{ id: 'x'.repeat(10_000) }] },
      history: [{ role: 'user', content: 'hi' }],
      currentContext: { activeStoreId: 'store-old' },
      storeCreateForm: {
        storeName: 'ABC',
        storeType: 'Food',
        location: 'Melbourne',
        intentMode: 'store',
        websiteUrl: 'https://abc.example',
        phone: '0399991111',
      },
      storeCreationDraft: {
        name: 'ABC',
        category: 'Food',
        location: 'Melbourne',
        missingFields: [],
        source: 'chat',
      },
      conversationSessionId: 'sess-1',
      traceId: 'trace-1',
    };
    const normalized = normalizeFreshStoreCreationBody(heavy);
    expect(normalized.unifiedMemory).toBeUndefined();
    expect(normalized.history).toBeUndefined();
    expect(normalized.currentContext).toBeUndefined();
    expect(normalized.storeCreateForm.storeName).toBe('ABC');
    expect(normalized.storeCreateForm.websiteUrl).toBe('https://abc.example');
    expect(normalized.storeCreateForm.phone).toBe('0399991111');
    expect(normalized.conversationSessionId).toBe('sess-1');
    expect(normalized.traceId).toBe('trace-1');
    expect(estimateJsonBytes(normalized)).toBeLessThan(estimateJsonBytes(heavy) / 10);
  });

  it('seeds website/phone from storeCandidate when image identity matches', () => {
    const image = `data:image/png;base64,${'C'.repeat(120)}`;
    const seeded = seedStoreCreateFormFromUploadContext({
      imageDataUrl: image,
      storeCreateForm: { storeName: '', storeType: '', location: '', intentMode: 'store' },
      intentSourceContext: {
        pendingImageDataUrl: image,
        storeCandidate: {
          businessName: 'Nail Bar',
          location: 'Richmond',
          category: 'Beauty',
          website: 'https://nailbar.example',
          phone: '0411222333',
          email: 'hi@nailbar.example',
          imageDataUrl: image,
        },
      },
    });
    expect(seeded.storeName).toBe('Nail Bar');
    expect(seeded.websiteUrl).toBe('https://nailbar.example');
    expect(seeded.phone).toBe('0411222333');
    expect(seeded.email).toBe('hi@nailbar.example');
  });

  it('preserves websiteTemplateId on fresh store body', () => {
    const normalized = normalizeFreshStoreCreationBody({
      message: 'Create store: Glow · Beauty · Melbourne',
      intent: 'create_store',
      source: 'store_creation_draft',
      _autoSubmit: true,
      freshStoreMission: true,
      storeCreateForm: {
        storeName: 'Glow',
        storeType: 'Beauty',
        location: 'Melbourne',
        intentMode: 'store',
      },
      storeCreationDraft: {
        name: 'Glow',
        category: 'Beauty',
        location: 'Melbourne',
        missingFields: [],
        source: 'chat',
      },
      websiteTemplateId: 'tpl_1',
      websiteTemplateSlug: 'beauty-wellness-website',
      parameters: {
        websiteTemplateId: 'tpl_1',
        baseWebsiteTemplate: 'tpl_1',
        baseWebsiteTemplateSlug: 'beauty-wellness-website',
      },
      intentSourceContext: {
        websiteTemplateId: 'tpl_1',
        websiteTemplateSlug: 'beauty-wellness-website',
        websiteTemplateName: 'Beauty',
      },
    });
    expect(normalized.websiteTemplateId).toBe('tpl_1');
    expect(normalized.websiteTemplateSlug).toBe('beauty-wellness-website');
    expect(normalized.parameters?.websiteTemplateId).toBe('tpl_1');
    expect(normalized.intentSourceContext?.websiteTemplateId).toBe('tpl_1');
  });

  it('strips heavy fields from oversized non-fresh payloads', () => {
    const heavy = {
      message: 'hello',
      unifiedMemory: { blob: 'x'.repeat(300_000) },
      history: Array.from({ length: 20 }, (_, i) => ({ role: 'user', content: `m${i}` })),
    };
    const guard = applyIntakePayloadGuard(heavy, { maxBytes: 64 * 1024 });
    expect(guard.stripped).toContain('unifiedMemory');
    expect(guard.stripped).toContain('history');
    expect(guard.body.unifiedMemory).toBeUndefined();
  });

  it('preserves upload evidence on oversized payloads even when decision loop is off', () => {
    const heavy = {
      message: '(Image attached)',
      userMessage: '(Image attached)',
      unifiedMemory: { blob: 'x'.repeat(300_000) },
      history: Array.from({ length: 20 }, (_, i) => ({ role: 'user', content: `m${i}` })),
      imageDataUrl: 'data:image/png;base64,abc',
      attachments: [{ type: 'image', dataUrl: 'data:image/png;base64,abc' }],
      intentSourceContext: { cardExtraction: { businessName: 'Test Shop' } },
    };
    const guard = applyIntakePayloadGuard(heavy, { maxBytes: 64 * 1024 });
    expect(guard.stripped).toContain('unifiedMemory');
    expect(guard.stripped).toContain('history');
    expect(guard.rejected).toBe(false);
    expect(guard.body.imageDataUrl).toBe('data:image/png;base64,abc');
    expect(guard.body.intentSourceContext?.cardExtraction?.businessName).toBe('Test Shop');
    expect(guard.body.unifiedMemory).toBeUndefined();
    expect(guard.body.history).toBeUndefined();
  });

  it('slims oversized upload payloads without rejecting', () => {
    const image = 'data:image/jpeg;base64,' + 'A'.repeat(280_000);
    const heavy = {
      userMessage: '(Image attached)',
      imageDataUrl: image,
      unifiedMemory: { blob: 'x'.repeat(200_000) },
      history: Array.from({ length: 30 }, (_, i) => ({ role: 'user', content: `line-${i}-`.repeat(40) })),
      currentContext: { unifiedMemory: { stores: [{ id: 's1' }] }, activeStoreId: 's1' },
      intentSourceContext: {
        cardExtraction: { businessName: 'PTH Furniture' },
        pendingImageDataUrl: image,
      },
    };
    const guard = applyIntakePayloadGuard(heavy);
    expect(guard.rejected).toBe(false);
    expect(guard.body.imageDataUrl).toBe(image);
    expect(guard.body.history).toBeUndefined();
    expect(guard.body.currentContext).toBeUndefined();
    expect(guard.body.intentSourceContext?.cardExtraction?.businessName).toBe('PTH Furniture');
  });

  it('rejects payloads that remain too large after trim', () => {
    const heavy = {
      message: 'hello',
      hugeField: 'z'.repeat(400_000),
    };
    const guard = applyIntakePayloadGuard(heavy, { maxBytes: 256 * 1024 });
    expect(guard.rejected).toBe(true);
  });

  it('keeps Ask Create store selection under freshStoreMission normalize', () => {
    const image = `data:image/png;base64,${'B'.repeat(120)}`;
    const body = {
      text: 'Create store from uploaded card',
      freshStoreMission: true,
      imageDataUrl: image,
      unifiedMemory: { blob: 'x'.repeat(50_000) },
      history: [{ role: 'user', content: 'prior' }],
      intentSourceContext: {
        fromAskSelection: 'create_store',
        assetAction: 'create_store',
        type: 'CREATE_STORE_FROM_UPLOAD',
      },
      intakeV2Selection: {
        selectedTool: 'create_store',
        selectedParameters: {
          source: 'upload_ask_selection',
          type: 'CREATE_STORE_FROM_UPLOAD',
          evidenceId: 'ev_ask',
        },
      },
    };
    const guard = applyIntakePayloadGuard(body);
    expect(guard.freshStoreMission).toBe(true);
    expect(guard.body.history).toBeUndefined();
    expect(guard.body.unifiedMemory).toBeUndefined();
    expect(guard.body.imageDataUrl).toBe(image);
    expect(guard.body.intentSourceContext?.fromAskSelection).toBe('create_store');
    expect(guard.body.intakeV2Selection?.selectedTool).toBe('create_store');
    expect(shouldSkipUploadAskForIntakeSelectionReplay(guard.body)).toBe(true);
    // Must not coerce into hollow draft confirmation (triggers early MISSING_NAME).
    expect(guard.body._autoSubmit).not.toBe(true);
    expect(guard.body.source).not.toBe('store_creation_draft');
  });

  it('A: verified cardExtraction.businessName projects into storeName', () => {
    const seeded = seedStoreCreateFormFromUploadContext({
      intentSourceContext: {
        fromAskSelection: 'create_store',
        cardExtraction: {
          businessName: 'PTH International Furniture',
          location: 'Derrimut',
          vertical: 'Furniture',
        },
      },
    });
    expect(seeded.storeName).toBe('PTH International Furniture');
    expect(seeded.location).toBe('Derrimut');
    expect(seeded.storeType).toBe('Furniture');
  });

  it('B: upload create_store normalize does not force empty draft confirmation', () => {
    const image = `data:image/png;base64,${'C'.repeat(80)}`;
    const normalized = normalizeCreateStoreFromUploadBody({
      text: 'Create store from uploaded card',
      freshStoreMission: true,
      intentSource: 'business_card',
      imageDataUrl: image,
      intentSourceContext: {
        fromAskSelection: 'create_store',
        type: 'CREATE_STORE_FROM_UPLOAD',
        pendingImageDataUrl: image,
        cardExtraction: { businessName: 'PTH International Furniture' },
      },
      intakeV2Selection: {
        selectedTool: 'create_store',
        selectedParameters: { source: 'upload_ask_selection', type: 'CREATE_STORE_FROM_UPLOAD' },
      },
    });
    expect(normalized._autoSubmit).toBeUndefined();
    expect(normalized.storeCreateForm?.storeName).toBe('PTH International Furniture');
    expect(normalized.intentSource).toBe('business_card');
  });

  it('D: mismatched upload pixels do not seed prior cardExtraction name', () => {
    const seeded = seedStoreCreateFormFromUploadContext({
      imageDataUrl: `data:image/png;base64,${'H'.repeat(80)}`,
      intentSourceContext: {
        pendingImageDataUrl: `data:image/png;base64,${'P'.repeat(80)}`,
        cardExtraction: {
          businessName: 'PTH International Furniture',
          location: 'VIC 3026',
        },
      },
    });
    expect(seeded.storeName).toBe('');
    expect(seeded.location).toBe('');
  });

  it('E: explicit storeCreateForm overrides cardExtraction', () => {
    const seeded = seedStoreCreateFormFromUploadContext({
      storeCreateForm: { storeName: 'Owner Chosen Name', location: 'Sydney', storeType: 'Retail' },
      intentSourceContext: {
        cardExtraction: { businessName: 'PTH International Furniture', location: 'Derrimut' },
      },
    });
    expect(seeded.storeName).toBe('Owner Chosen Name');
    expect(seeded.location).toBe('Sydney');
  });
});
