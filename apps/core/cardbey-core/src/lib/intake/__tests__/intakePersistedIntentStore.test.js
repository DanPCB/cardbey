import { describe, expect, it, beforeEach } from 'vitest';
import {
  clearPersistedIntentStoreForTests,
  getPersistedIntentResolution,
  setPersistedIntentResolution,
  shouldPersistIntentResolution,
  strongOntologyOverridesPersisted,
} from '../intakePersistedIntentStore.js';
import { resolveIntent } from '../intakeIntentResolver.js';

beforeEach(() => {
  clearPersistedIntentStoreForTests();
});

describe('intakePersistedIntentStore', () => {
  it('writes and reads mission-scoped intent', () => {
    setPersistedIntentResolution({
      actorKey: 'u:1',
      tenantKey: 't:1',
      missionId: 'm-a',
      storeId: 's1',
      draftId: null,
      family: 'website_edit',
      subtype: 'change_hero_image',
      chosenTool: 'improve_hero',
      executionPath: 'proactive_plan',
      source: 'resolver',
    });
    const row = getPersistedIntentResolution({
      actorKey: 'u:1',
      tenantKey: 't:1',
      missionId: 'm-a',
      storeId: 's1',
      draftId: null,
    });
    expect(row?.subtype).toBe('change_hero_image');
    expect(row?.chosenTool).toBe('improve_hero');
  });

  it('does not leak across missions', () => {
    setPersistedIntentResolution({
      actorKey: 'u:1',
      tenantKey: 't:1',
      missionId: 'm-a',
      storeId: 's1',
      draftId: null,
      family: 'website_edit',
      subtype: 'change_hero_image',
      chosenTool: 'improve_hero',
      executionPath: 'proactive_plan',
    });
    const other = getPersistedIntentResolution({
      actorKey: 'u:1',
      tenantKey: 't:1',
      missionId: 'm-b',
      storeId: 's1',
      draftId: null,
    });
    expect(other).toBeNull();
  });

  it('store context mismatch ignores persisted row', () => {
    setPersistedIntentResolution({
      actorKey: 'u:1',
      tenantKey: 't:1',
      missionId: 'm-a',
      storeId: 's1',
      draftId: null,
      family: 'website_edit',
      subtype: 'change_hero_image',
      chosenTool: 'improve_hero',
    });
    const row = getPersistedIntentResolution({
      actorKey: 'u:1',
      tenantKey: 't:1',
      missionId: 'm-a',
      storeId: 's2',
      draftId: null,
    });
    expect(row).toBeNull();
  });
});

describe('resolveIntent + persisted (no history)', () => {
  it('A: hero follow-up stays change_hero_image with empty history when persisted', () => {
    const persisted = {
      family: 'website_edit',
      subtype: 'change_hero_image',
      chosenTool: 'improve_hero',
      executionPath: 'proactive_plan',
      updatedAt: new Date().toISOString(),
      missionId: 'm1',
      storeId: 's1',
      draftStoreId: null,
      source: 'resolver',
    };
    const r = resolveIntent({
      userMessage: 'use a fashion photo instead',
      classification: { tool: 'general_chat', confidence: 0.2, executionPath: 'chat', parameters: {} },
      storeId: 's1',
      draftId: null,
      conversationHistory: [],
      persistedIntentResolution: persisted,
    });
    expect(r.subtype).toBe('change_hero_image');
    expect(r.chosenTool).toBe('improve_hero');
    expect(r.persistedIntentUsed).toBe(true);
  });

  it('B: strong promotion intent overrides persisted hero', () => {
    const persisted = {
      family: 'website_edit',
      subtype: 'change_hero_image',
      chosenTool: 'improve_hero',
      updatedAt: new Date().toISOString(),
      storeId: 's1',
      draftStoreId: null,
      source: 'resolver',
    };
    const r = resolveIntent({
      userMessage: 'create a weekend discount offer with 15% off for my store',
      classification: { tool: 'general_chat', confidence: 0.2, executionPath: 'chat', parameters: {} },
      storeId: 's1',
      draftId: null,
      conversationHistory: [],
      persistedIntentResolution: persisted,
    });
    expect(r.subtype).toBe('set_discount');
    expect(r.persistedIntentOverridden).toBe(true);
  });

  it('D: absent persisted falls back to normal resolver', () => {
    const r = resolveIntent({
      userMessage: 'use a fashion photo instead',
      classification: { tool: 'general_chat', confidence: 0.2, executionPath: 'chat', parameters: {} },
      storeId: 's1',
      draftId: null,
      conversationHistory: [],
      persistedIntentResolution: null,
    });
    expect(r.resolverReason === 'unresolved' || r.chosenTool === 'create_offer').toBe(true);
  });
});

describe('shouldPersistIntentResolution', () => {
  it('E: persists meaningful ontology resolution', () => {
    expect(
      shouldPersistIntentResolution(
        {
          family: 'website_edit',
          subtype: 'change_hero_image',
          chosenTool: 'improve_hero',
          resolverReason: 'ontology:website_edit/change_hero_image',
        },
        'success',
      ),
    ).toBe(true);
  });

  it('skips unresolved vague state', () => {
    expect(
      shouldPersistIntentResolution(
        {
          family: null,
          subtype: null,
          chosenTool: null,
          resolverReason: 'unresolved',
        },
        'clarify',
      ),
    ).toBe(false);
  });
});

describe('strongOntologyOverridesPersisted', () => {
  it('detects conflicting top subtype', () => {
    const top = { st: { subtype: 'set_discount' }, score: 8 };
    expect(strongOntologyOverridesPersisted(top, { subtype: 'change_hero_image' })).toBe(true);
    expect(strongOntologyOverridesPersisted(top, { subtype: 'set_discount' })).toBe(false);
  });
});
