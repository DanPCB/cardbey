import { describe, expect, it } from 'vitest';
import {
  buildAssetIngestFromCardExtraction,
  loadPersistedAssetIngestFromMissionMetadata,
} from '../attachmentOcrPersistence.js';

describe('buildAssetIngestFromCardExtraction', () => {
  it('builds ingest snapshot from client card fields', () => {
    const ingest = buildAssetIngestFromCardExtraction({
      businessName: 'PTH International Furniture',
      location: 'Derrimut, VIC',
      vertical: 'furniture',
    });
    expect(ingest?.entityContext?.detectedBusinessName).toBe('PTH International Furniture');
    expect(ingest?.ocrHints?.location).toMatch(/Derrimut|VIC/i);
  });
});

describe('loadPersistedAssetIngestFromMissionMetadata', () => {
  it('reads pending attachment OCR from mission metadata', () => {
    const loaded = loadPersistedAssetIngestFromMissionMetadata({
      pendingAttachmentOcr: {
        rawOcrText: 'ABC Bakery\nMelbourne',
        ocrHints: { businessName: 'ABC Bakery', location: 'Melbourne' },
      },
      assetIntentContext: {
        documentType: 'business_card',
        detectedBusinessName: 'ABC Bakery',
      },
    });
    expect(loaded?.rawOcrText).toContain('ABC Bakery');
    expect(loaded?.entityContext?.detectedBusinessName).toBe('ABC Bakery');
  });
});
