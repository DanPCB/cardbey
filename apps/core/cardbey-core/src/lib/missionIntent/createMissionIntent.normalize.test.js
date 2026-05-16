import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { normalizeCreateMissionIntentRequest } from './normalizeCreateMissionIntent.js';
import { serializeNormalizedIntentPayload } from './serializeNormalizedIntentPayload.js';
import { INTENT_MESSAGE_MAX_LENGTH } from './missionIntentPayloadKeys.js';

function roundTrip(body, missionId = 'm1', userId = 'u1') {
  const r = normalizeCreateMissionIntentRequest({ missionId, userId, body });
  expect(r.ok).toBe(true);
  const ser = serializeNormalizedIntentPayload(r.normalized);
  return { normalized: r.normalized, serialized: ser };
}

describe('createMissionIntent normalize + serialize (golden / snapshot gate)', () => {
  it('A legacy mi_assistant_message round-trips flat payload unchanged', () => {
    const body = {
      type: 'mi_assistant_message',
      payload: {
        message: 'hello',
        source: 'mi_assistant',
        storeId: 's1',
      },
    };
    const { normalized, serialized } = roundTrip(body);
    expect(normalized.payloadShape).toBe('legacy_flat');
    expect(serialized).toEqual({
      message: 'hello',
      source: 'mi_assistant',
      storeId: 's1',
    });
  });

  it('golden generate_tags (legacy flat)', () => {
    const body = {
      type: 'generate_tags',
      payload: {
        storeId: 'store-1',
        draftId: 'draft-1',
        generationRunId: 'run-1',
        source: 'improve_dropdown',
      },
    };
    const { normalized, serialized } = roundTrip(body);
    expect(normalized.payloadShape).toBe('legacy_flat');
    expect(serialized).toEqual(body.payload);
  });

  it('golden rewrite_descriptions (legacy flat)', () => {
    const body = {
      type: 'rewrite_descriptions',
      payload: {
        storeId: 's',
        draftId: 'd',
        source: 'draft_review',
        entityType: 'product',
        productId: 'p9',
        productName: 'Latte',
      },
    };
    const { normalized, serialized } = roundTrip(body);
    expect(normalized.payloadShape).toBe('legacy_flat');
    expect(serialized).toEqual(body.payload);
  });

  it('golden create_offer (legacy flat with offer fields in metadata passthrough)', () => {
    const body = {
      type: 'create_offer',
      payload: {
        storeId: 'store-x',
        title: 'Special offer',
        slug: 'special-offer',
        description: 'Nice',
        priceText: '$5',
        source: 'mi_assistant',
      },
    };
    const { normalized, serialized } = roundTrip(body);
    expect(normalized.payloadShape).toBe('legacy_flat');
    expect(serialized).toEqual(body.payload);
  });

  it('golden ImproveDropdown-style sample', () => {
    const body = {
      type: 'generate_tags',
      payload: {
        storeId: 's1',
        draftId: 'd1',
        generationRunId: 'g1',
        productIds: ['p1', 'p2'],
        source: 'improve_dropdown',
      },
    };
    const { normalized, serialized } = roundTrip(body);
    expect(normalized.payloadShape).toBe('legacy_flat');
    expect(serialized).toEqual(body.payload);
  });

  it('B structured payload normalizes and serializes to flat-compatible JSON', () => {
    const body = {
      type: 'mi_assistant_message',
      payload: {
        version: 1,
        source: 'mi_assistant',
        message: 'hello',
        context: { storeId: 's1' },
        entity: { productId: 'p1', productName: 'Coffee' },
        metadata: { productIds: ['p1'] },
      },
    };
    const { normalized, serialized } = roundTrip(body);
    expect(normalized.payloadShape).toBe('structured');
    expect(serialized).toEqual({
      productIds: ['p1'],
      message: 'hello',
      source: 'mi_assistant',
      storeId: 's1',
      productId: 'p1',
      productName: 'Coffee',
    });
  });

  it('C missing source defaults and appears when other payload signals exist', () => {
    const body = {
      type: 'mi_assistant_message',
      payload: {
        message: 'hello',
        storeId: 's1',
      },
    };
    const { normalized, serialized } = roundTrip(body);
    expect(normalized.source).toBe('mi_assistant');
    expect(normalized.explicitSourceProvided).toBe(false);
    expect(serialized).toEqual({
      message: 'hello',
      storeId: 's1',
      source: 'mi_assistant',
    });
  });

  it('D unknown legacy keys survive at flat root (metadata round-trip)', () => {
    const body = {
      type: 'generate_tags',
      payload: {
        storeId: 's',
        draftId: 'd',
        source: 'x',
        customFlag: true,
        nestedLater: { a: 1 },
      },
    };
    const { normalized, serialized } = roundTrip(body);
    expect(normalized.metadata.customFlag).toBe(true);
    expect(normalized.metadata.nestedLater).toEqual({ a: 1 });
    expect(serialized).toEqual(body.payload);
  });

  it('E message longer than cap truncates and flags (warn in non-production)', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const long = 'x'.repeat(INTENT_MESSAGE_MAX_LENGTH + 50);
    const body = {
      type: 'mi_assistant_message',
      payload: { message: long, source: 'mi_assistant' },
    };
    const { normalized, serialized } = roundTrip(body);
    expect(normalized.messageTruncated).toBe(true);
    expect(serialized.message.length).toBe(INTENT_MESSAGE_MAX_LENGTH);
    if (process.env.NODE_ENV !== 'production') {
      expect(warnSpy).toHaveBeenCalled();
    }
    warnSpy.mockRestore();
  });

  it('F bad payload type (array) preserves null payload like legacy route', () => {
    const body = { type: 'generate_tags', payload: [1, 2] };
    const r = normalizeCreateMissionIntentRequest({ missionId: 'm1', userId: 'u1', body });
    expect(r.ok).toBe(true);
    expect(r.normalized.hadPayloadObject).toBe(false);
    expect(serializeNormalizedIntentPayload(r.normalized)).toBe(null);
  });

  it('F bad payload type (primitive) preserves null payload', () => {
    const body = { type: 'generate_tags', payload: 'nope' };
    const r = normalizeCreateMissionIntentRequest({ missionId: 'm1', userId: 'u1', body });
    expect(r.ok).toBe(true);
    expect(r.normalized.hadPayloadObject).toBe(false);
    expect(serializeNormalizedIntentPayload(r.normalized)).toBe(null);
  });

  it('ignores missionId inside payload body (not persisted)', () => {
    const body = {
      type: 'rewrite_descriptions',
      payload: {
        missionId: 'evil',
        storeId: 's',
        draftId: 'd',
        source: 'draft_review',
      },
    };
    const { normalized, serialized } = roundTrip(body);
    expect(serialized.missionId).toBeUndefined();
    expect(normalized.metadata.missionId).toBeUndefined();
  });

  it('rejects missing type', () => {
    const r = normalizeCreateMissionIntentRequest({
      missionId: 'm1',
      userId: 'u1',
      body: { payload: {} },
    });
    expect(r.ok).toBe(false);
    expect(r.error).toBe('type_required');
  });

  it('legacy empty object stays {} (no injected source)', () => {
    const body = { type: 'generate_tags', payload: {} };
    const { normalized, serialized } = roundTrip(body);
    expect(normalized.hadPayloadObject).toBe(true);
    expect(serialized).toEqual({});
  });

  it('agent passes through on normalized object (envelope)', () => {
    const body = { type: 'generate_tags', agent: 'CatalogAgent', payload: { source: 'x', storeId: 's' } };
    const r = normalizeCreateMissionIntentRequest({ missionId: 'm1', userId: 'u1', body });
    expect(r.ok).toBe(true);
    expect(r.normalized.agent).toBe('CatalogAgent');
  });
});
