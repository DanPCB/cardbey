import { describe, expect, it } from 'vitest';
import {
  buildAssetExtractionInput,
  buildOcrHintsFromImageText,
  extractFirstUrlFromText,
  formatAssetStoreDraftResponse,
  hasMeaningfulAssetExtraction,
  mapVerticalSlugToCategory,
  shouldRouteIngestToStoreCreationDraft,
} from '../storeCreationDraftAssetBridge.js';
import { buildStoreCreationDraft } from '../storeCreationDraft.js';

const SAMPLE_CARD = `ABC Bakery
123 Main St, Melbourne VIC 3000
04 1234 5678
hello@abcbakery.com.au
www.abcbakery.com.au`;

describe('buildOcrHintsFromImageText', () => {
  it('extracts business card fields', () => {
    const hints = buildOcrHintsFromImageText(SAMPLE_CARD);
    expect(hints?.businessName).toBe('ABC Bakery');
    expect(hints?.location).toMatch(/VIC|Melbourne/i);
    expect(hints?.phone).toBeTruthy();
    expect(hints?.email).toMatch(/abcbakery/i);
    expect(hints?.website).toMatch(/abcbakery/i);
  });
});

describe('shouldRouteIngestToStoreCreationDraft', () => {
  it('routes business_card uploads with extracted name to store draft', () => {
    const ingestResult = {
      ok: true,
      entityContext: { documentType: 'business_card', detectedBusinessName: 'ABC Bakery' },
    };
    const assetExtraction = buildAssetExtractionInput({
      ingestResult,
      imageContext: { extractedText: SAMPLE_CARD },
    });
    expect(
      shouldRouteIngestToStoreCreationDraft({
        ingestResult,
        assetExtraction,
        explicitCreateStore: false,
      }),
    ).toBe(true);
    expect(hasMeaningfulAssetExtraction(assetExtraction)).toBe(true);
  });
});

describe('buildStoreCreationDraft from asset', () => {
  it('builds complete draft from business card OCR', () => {
    const assetExtraction = buildAssetExtractionInput({
      imageContext: { extractedText: SAMPLE_CARD },
      ingestResult: {
        entityContext: { documentType: 'business_card', detectedBusinessName: 'ABC Bakery' },
      },
    });
    const bundle = buildStoreCreationDraft({
      userMessage: '(Image attached)',
      classification: { parameters: { source: 'business_card' } },
      assetExtraction,
    });
    expect(bundle.draft.name).toBe('ABC Bakery');
    expect(bundle.draft.location).toMatch(/VIC|Melbourne/i);
    expect(bundle.draft.phone).toBeTruthy();
    expect(bundle.draft.email).toMatch(/abcbakery/i);
    expect(bundle.isComplete).toBe(true);
  });

  it('formats asset-sourced response with contact fields', () => {
    const bundle = buildStoreCreationDraft({
      userMessage: '',
      classification: { parameters: { source: 'business_card' } },
      assetExtraction: {
        name: 'ABC Bakery',
        location: 'Melbourne',
        category: 'Food & drink',
        phone: '0400 123 456',
        source: 'business_card',
        documentType: 'business_card',
      },
    });
    const text = formatAssetStoreDraftResponse(bundle, { documentType: 'business_card' });
    expect(text).toContain('business card');
    expect(text).toContain('ABC Bakery');
    expect(text).toContain('0400 123 456');
    expect(text).toContain('Ready to create your store?');
  });
});

describe('extractFirstUrlFromText', () => {
  it('finds https URLs in text', () => {
    expect(extractFirstUrlFromText('Create store from https://example.com/page')).toBe(
      'https://example.com/page',
    );
  });
});

describe('mapVerticalSlugToCategory', () => {
  it('maps food_beverage slug', () => {
    expect(mapVerticalSlugToCategory('food_beverage')).toBe('Food & drink');
  });
});
