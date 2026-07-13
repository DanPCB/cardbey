/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import { composeFromUnderstandingBundle, bundleToLoyaltyContracts } from '../businessCompositionEngine.js';
import { renderLoyaltyDesktopChannel } from '../channelRenderers/loyaltyDesktopRenderer.js';
import { interpretBueArtifactDocument } from '../bueDocumentInterpretation.js';

const loyaltyBundle = {
  artifact: {
    schema: 'cb-artifact',
    version: 'v1',
    artifactType: 'loyalty_card',
    classification: { artifactType: 'loyalty_card', confidence: 0.95 },
    extractedAt: new Date().toISOString(),
  },
  layout: {
    schema: 'cb-layout',
    version: 'v1',
    rows: 4,
    columns: 8,
    cells: Array.from({ length: 32 }, (_, idx) => ({
      row: Math.floor(idx / 8),
      column: idx % 8,
      role: idx % 8 === 7 ? 'REWARD' : 'PURCHASE',
      label: idx % 8 === 7 ? 'Free' : 'Coffee',
    })),
    footerText: { value: 'Catering Available', confidence: 0.9, source: 'OBSERVED' },
  },
  businessRule: {
    schema: 'cb-business-rule',
    version: 'v1',
    earningRule: { action: 'purchase', item: 'coffee', required: 7, confidence: 0.9, source: 'OBSERVED' },
    reward: { type: 'free_item', item: 'free', quantity: 1, confidence: 0.9, source: 'OBSERVED' },
  },
  brand: {
    schema: 'cb-brand',
    version: 'v1',
    brandName: { value: 'My Cafe', confidence: 0.9, source: 'OBSERVED' },
    primaryColors: { value: ['#4f46e5', '#7c3aed'], confidence: 0.8, source: 'OBSERVED' },
  },
  intent: {
    schema: 'cb-intent',
    version: 'v1',
    primaryIntent: { value: 'reward_customer', confidence: 0.9, source: 'INFERRED' },
  },
  adaptationMode: 'brand_consistent',
  pipelineVersion: 'bue-v1',
  extractedAt: new Date().toISOString(),
};

describe('businessCompositionEngine', () => {
  it('composes desktop loyalty render from bundle without OCR', () => {
    const composed = composeFromUnderstandingBundle(loyaltyBundle, { channel: 'desktop' });
    expect(composed.rendererMode).toBe('CONTRACT_DRIVEN');
    expect(composed.loyalty?.cardTopology?.rows).toBe(4);
    expect(composed.loyalty?.cardTopology?.columns).toBe(8);
    expect(composed.loyalty?.rule?.purchasesRequired).toBe(7);
  });

  it('renders loyalty desktop channel payload', () => {
    const rendered = renderLoyaltyDesktopChannel(loyaltyBundle);
    expect(rendered.ok).toBe(true);
    expect(rendered.rendererMode).toBe('CONTRACT_DRIVEN');
    expect(rendered.payload?.cardTopology?.columns).toBe(8);
  });

  it('maps bundle contracts to loyalty topology + rule', () => {
    const mapped = bundleToLoyaltyContracts(loyaltyBundle);
    expect(mapped.cardTopology?.cells?.length).toBe(32);
    expect(mapped.rule?.purchasesRequired).toBe(7);
  });
});

describe('bueDocumentInterpretation', () => {
  it('interprets menu artifact from OCR lines', () => {
    const menuBundle = {
      ...loyaltyBundle,
      artifact: {
        ...loyaltyBundle.artifact,
        artifactType: 'menu',
        classification: { artifactType: 'menu', confidence: 0.9 },
      },
      layout: null,
      businessRule: null,
    };
    const result = interpretBueArtifactDocument(menuBundle, {
      ocrText: 'Breakfast\nEggs on toast $12\nLatte $5',
    });
    expect(result.ok).toBe(true);
    expect(result.topology?.documentType).toBe('MENU');
    expect(result.topology?.cells?.length).toBeGreaterThan(0);
  });

  it('interprets promotion flyer artifact', () => {
    const flyerBundle = {
      ...loyaltyBundle,
      artifact: {
        ...loyaltyBundle.artifact,
        artifactType: 'promotion_flyer',
        classification: { artifactType: 'promotion_flyer', confidence: 0.88 },
      },
      layout: null,
      businessRule: null,
    };
    const result = interpretBueArtifactDocument(flyerBundle, {
      ocrText: 'Grand Opening\n20% off all drinks',
      documentExtraction: { campaign: { name: 'Grand Opening' } },
    });
    expect(result.ok).toBe(true);
    expect(result.topology?.documentType).toBe('PROMOTION_FLYER');
  });
});
