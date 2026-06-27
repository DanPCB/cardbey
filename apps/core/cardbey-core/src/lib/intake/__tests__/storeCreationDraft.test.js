import { describe, expect, it } from 'vitest';
import {
  buildStoreCreationDraft,
  formatStoreCreationDraftResponse,
  isStoreCreationDraftConfirmationSubmit,
  parseNaturalLanguageStoreCreation,
  parseStoreCreationFromUserMessage,
  resolveStoreCreateFormFromDraftSubmitBody,
} from '../storeCreationDraft.js';

describe('parseNaturalLanguageStoreCreation', () => {
  it('parses "Create a bakery in Melbourne called ABC Bakery"', () => {
    const parsed = parseNaturalLanguageStoreCreation('Create a bakery in Melbourne called ABC Bakery');
    expect(parsed.name).toBe('ABC Bakery');
    expect(parsed.location).toBe('Melbourne');
    expect(parsed.category).toBe('Food & drink');
  });

  it('parses "Create a store called ABC Bakery in Melbourne"', () => {
    const parsed = parseNaturalLanguageStoreCreation('Create a store called ABC Bakery in Melbourne');
    expect(parsed.name).toBe('ABC Bakery');
    expect(parsed.location).toBe('Melbourne');
  });

  it('parses pill messages', () => {
    const parsed = parseNaturalLanguageStoreCreation('ABC Bakery · Food & drink · Melbourne');
    expect(parsed.name).toBe('ABC Bakery');
    expect(parsed.location).toBe('Melbourne');
    expect(parsed.category).toBe('Food & drink');
  });
});

describe('buildStoreCreationDraft', () => {
  it('marks complete draft when name, location, and category are known', () => {
    const bundle = buildStoreCreationDraft({
      userMessage: 'Create a bakery in Melbourne called ABC Bakery',
      classification: { tool: 'create_store', confidence: 0.98, parameters: { source: 'intent_reasoning' } },
    });
    expect(bundle.isComplete).toBe(true);
    expect(bundle.missingFields).toEqual([]);
    expect(bundle.draft.name).toBe('ABC Bakery');
    expect(bundle.draft.location).toBe('Melbourne');
    expect(bundle.draft.category).toBe('Food & drink');
  });

  it('reports missing location only', () => {
    const bundle = buildStoreCreationDraft({
      userMessage: 'Create a store called ABC Bakery',
      classification: { parameters: {} },
    });
    expect(bundle.missingFields).toContain('location');
    expect(bundle.draft.name).toBe('ABC Bakery');
    expect(bundle.isComplete).toBe(false);
  });
});

describe('formatStoreCreationDraftResponse', () => {
  it('summarizes a complete bakery draft', () => {
    const bundle = buildStoreCreationDraft({
      userMessage: 'Create a bakery in Melbourne called ABC Bakery',
      classification: { parameters: {} },
    });
    const text = formatStoreCreationDraftResponse(bundle);
    expect(text).toContain('ABC Bakery');
    expect(text).toContain('Melbourne');
    expect(text).toContain('Ready to create your store?');
  });
});

describe('parseStoreCreationFromUserMessage adapter', () => {
  it('returns legacy shape', () => {
    const legacy = parseStoreCreationFromUserMessage('Create a bakery in Melbourne called ABC Bakery');
    expect(legacy.storeName).toBe('ABC Bakery');
    expect(legacy.location).toBe('Melbourne');
    expect(legacy.storeType).toBe('Food & drink');
  });
});

describe('store creation draft confirmation submit', () => {
  it('detects store_creation_draft source', () => {
    expect(
      isStoreCreationDraftConfirmationSubmit({
        source: 'store_creation_draft',
        storeCreationDraft: { name: 'ABC Bakery', category: 'Food & drink', location: 'Melbourne' },
      }),
    ).toBe(true);
    const form = resolveStoreCreateFormFromDraftSubmitBody({
      name: 'ABC Bakery',
      category: 'Food & drink',
      location: 'Melbourne',
    });
    expect(form?.storeName).toBe('ABC Bakery');
    expect(form?.location).toBe('Melbourne');
    expect(form?.storeType).toBe('Food & drink');
  });
});
