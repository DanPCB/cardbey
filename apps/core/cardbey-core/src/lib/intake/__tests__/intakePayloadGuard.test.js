/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import {
  applyIntakePayloadGuard,
  estimateJsonBytes,
  isFreshStoreCreationMission,
  normalizeFreshStoreCreationBody,
} from '../intakePayloadGuard.js';

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
    expect(normalized.conversationSessionId).toBe('sess-1');
    expect(normalized.traceId).toBe('trace-1');
    expect(estimateJsonBytes(normalized)).toBeLessThan(estimateJsonBytes(heavy) / 10);
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

  it('preserves upload evidence when decision loop authority is on', () => {
    const prev = process.env.INTAKE_DECISION_LOOP_AUTHORITY;
    process.env.INTAKE_DECISION_LOOP_AUTHORITY = 'true';
    try {
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
    } finally {
      if (prev === undefined) delete process.env.INTAKE_DECISION_LOOP_AUTHORITY;
      else process.env.INTAKE_DECISION_LOOP_AUTHORITY = prev;
    }
  });

  it('slims oversized upload payloads for decision loop without rejecting', () => {
    const prev = process.env.INTAKE_DECISION_LOOP_AUTHORITY;
    process.env.INTAKE_DECISION_LOOP_AUTHORITY = 'true';
    try {
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
    } finally {
      if (prev === undefined) delete process.env.INTAKE_DECISION_LOOP_AUTHORITY;
      else process.env.INTAKE_DECISION_LOOP_AUTHORITY = prev;
    }
  });

  it('rejects payloads that remain too large after trim', () => {
    const heavy = {
      message: 'hello',
      hugeField: 'z'.repeat(400_000),
    };
    const guard = applyIntakePayloadGuard(heavy, { maxBytes: 256 * 1024 });
    expect(guard.rejected).toBe(true);
  });
});
