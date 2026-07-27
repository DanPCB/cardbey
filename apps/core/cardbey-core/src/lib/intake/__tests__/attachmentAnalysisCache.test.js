import { describe, it, expect, beforeEach } from 'vitest';
import {
  buildAttachmentCacheKey,
  getCachedAttachmentAnalysis,
  setCachedAttachmentAnalysis,
  __clearAttachmentAnalysisCacheForTests,
} from '../attachmentAnalysisCache.js';

describe('attachmentAnalysisCache', () => {
  beforeEach(() => {
    __clearAttachmentAnalysisCacheForTests();
  });

  it('reuses frozen analysis by content hash', () => {
    const imageRef = 'data:image/png;base64,abc123';
    const key = buildAttachmentCacheKey(imageRef);
    expect(key).toBeTruthy();
    setCachedAttachmentAnalysis(key, {
      evidenceId: 'ev-1',
      ocrTextRef: 'Bellamy Cafe',
      documentType: 'loyalty_card',
      confidence: 0.88,
      attachmentAnalysis: { artifactType: 'loyalty_card', confidence: 0.88 },
      completedAt: new Date().toISOString(),
    });
    const hit = getCachedAttachmentAnalysis(key);
    expect(hit?.evidenceId).toBe('ev-1');
    expect(hit?.attachmentAnalysis?.artifactType).toBe('loyalty_card');
    expect(hit?.attachmentAnalysis?.imageDataUrl).toBeUndefined();
  });
});
