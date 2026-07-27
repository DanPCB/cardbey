import { describe, expect, it } from 'vitest';
import {
  buildStoreCandidateFromCardExtraction,
  buildStoreCandidateFromOcr,
  formatStoreCandidateReviewResponse,
  mergeStoreCandidates,
  resolveStoreCandidateForHandoff,
  stashPendingDocumentExtraction,
  peekPendingDocumentExtraction,
  buildDocumentExtractionArtifact,
} from '../storeCandidate.js';
import { buildStoreCreationDraft } from '../storeCreationDraft.js';

const SAMPLE_CARD = `PTH INTERNATIONAL FURNITURE
Unit 3/12 Maitland Drive, Derrimut, VIC 3026
0413 091 727
pth.furniture@gmail.com
www.pthfurniture.com.au`;

const MENU_SAMPLE = `Joe's Pizza Menu
Margherita $18
Pepperoni $20
123 Smith St, Melbourne VIC 3000`;

describe('buildStoreCandidateFromOcr', () => {
  it('extracts business card fields with confidence', () => {
    const candidate = buildStoreCandidateFromOcr(SAMPLE_CARD, { documentType: 'business_card' });
    expect(candidate?.businessName).toMatch(/PTH/i);
    expect(candidate?.phone).toBeTruthy();
    expect(candidate?.email).toMatch(/pth\.furniture/i);
    expect(candidate?.website).toMatch(/pthfurniture/i);
    expect(candidate?.confidence).toBeGreaterThan(0.5);
    expect(candidate?.extractedFields.businessName?.value).toMatch(/PTH/i);
  });

  it('infers food category from menu text', () => {
    const candidate = buildStoreCandidateFromOcr(MENU_SAMPLE, { documentType: 'menu' });
    expect(candidate?.businessName).toMatch(/Joe/i);
    expect(candidate?.category).toMatch(/Food/i);
  });
});

describe('mergeStoreCandidates', () => {
  it('prefers higher-confidence fields when merging uploads', () => {
    const card = buildStoreCandidateFromCardExtraction({
      businessName: 'PTH International Furniture',
      location: 'Derrimut, VIC',
      vertical: 'furniture',
    });
    const menu = buildStoreCandidateFromOcr(MENU_SAMPLE, { documentType: 'menu' });
    const merged = mergeStoreCandidates(card, menu);
    expect(merged?.businessName).toMatch(/PTH|Joe/i);
    expect(merged?.extractedFields.businessName).toBeTruthy();
  });
});

describe('resolveStoreCandidateForHandoff', () => {
  it('resolves from client cardExtraction without re-OCR', () => {
    const candidate = resolveStoreCandidateForHandoff({
      intentSourceContext: {
        cardExtraction: {
          businessName: 'PTH International Furniture',
          location: 'Derrimut, VIC',
          vertical: 'furniture',
        },
      },
    });
    expect(candidate?.businessName).toBe('PTH International Furniture');
    expect(candidate?.address ?? candidate?.suburb ?? candidate?.city).toMatch(/Derrimut|VIC/i);
  });

  it('resolves stashed session extraction on follow-up confirm', () => {
    const candidate = buildStoreCandidateFromOcr(SAMPLE_CARD, { documentType: 'business_card' });
    const artifact = buildDocumentExtractionArtifact(candidate, {});
    stashPendingDocumentExtraction('sess-test-1', artifact);
    const resolved = resolveStoreCandidateForHandoff({ sessionId: 'sess-test-1' });
    expect(resolved?.businessName).toMatch(/PTH/i);
    expect(peekPendingDocumentExtraction('sess-test-1')?.artifactType).toBe('document_extraction');
  });
});

describe('formatStoreCandidateReviewResponse', () => {
  it('populates step 3 review text with extracted fields', () => {
    const candidate = buildStoreCandidateFromOcr(SAMPLE_CARD, { documentType: 'business_card' });
    const bundle = buildStoreCreationDraft({
      userMessage: 'Create a store from this document',
      classification: { parameters: { source: 'business_card' } },
      assetExtraction: {
        name: candidate?.businessName,
        location: 'Derrimut, VIC 3026',
        category: 'Home & garden',
        phone: candidate?.phone,
        email: candidate?.email,
        website: candidate?.website,
        source: 'business_card',
        documentType: 'business_card',
      },
    });
    const text = formatStoreCandidateReviewResponse(bundle, candidate, { documentType: 'business_card' });
    expect(text).toContain('from your card');
    expect(text).toContain('Please confirm or edit');
    expect(text).toMatch(/PTH/i);
    expect(text).toMatch(/3091|phone/i);
    expect(text).not.toMatch(/I found these details:\s*\n\s*I need/);
  });

  it('shows pending message when extraction has no fields yet', () => {
    const text = formatStoreCandidateReviewResponse(
      { draft: {}, isComplete: false },
      { imageDataUrl: 'data:image/png;base64,abc', extractedFields: {}, confidence: 0 },
      { documentType: 'business_card', extractionPending: true },
    );
    expect(text).toBe("I'm reading the uploaded card now...");
  });
});
