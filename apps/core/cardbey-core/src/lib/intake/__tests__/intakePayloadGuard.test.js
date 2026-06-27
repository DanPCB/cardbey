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

  it('rejects payloads that remain too large after trim', () => {
    const heavy = {
      message: 'hello',
      hugeField: 'z'.repeat(400_000),
    };
    const guard = applyIntakePayloadGuard(heavy, { maxBytes: 256 * 1024 });
    expect(guard.rejected).toBe(true);
  });
});
