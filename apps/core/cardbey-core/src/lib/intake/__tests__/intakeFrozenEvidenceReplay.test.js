/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import {
  attachmentImageRefsMatch,
  hydrateAttachmentAnalysisFromFrozenBundle,
  shouldReuseFrozenEvidenceBundle,
} from '../intakeFrozenEvidenceReplay.js';
import {
  __clearAttachmentEvidenceRegistryForTests,
  cacheAnalysisForImageRef,
} from '../attachmentEvidenceRegistry.js';

describe('intakeFrozenEvidenceReplay', () => {
  it('attachmentImageRefsMatch compares content hashes', () => {
    const ref = 'data:image/png;base64,abc123';
    expect(attachmentImageRefsMatch(ref, ref)).toBe(true);
    expect(attachmentImageRefsMatch(ref, 'data:image/png;base64,xyz')).toBe(false);
  });

  it('shouldReuseFrozenEvidenceBundle allows text-only replay without current image', () => {
    expect(
      shouldReuseFrozenEvidenceBundle({
        bundle: { imageRef: 'data:image/png;base64,abc' },
        currentImageRef: null,
      }),
    ).toBe(true);
  });

  it('shouldReuseFrozenEvidenceBundle rejects bundle when fresh image differs', () => {
    expect(
      shouldReuseFrozenEvidenceBundle({
        bundle: { imageRef: 'data:image/png;base64,old' },
        currentImageRef: 'data:image/png;base64,new',
        hasFreshImageAttachment: true,
      }),
    ).toBe(false);
  });

  it('hydrateAttachmentAnalysisFromFrozenBundle prefers cached analysis for bundle imageRef', () => {
    __clearAttachmentEvidenceRegistryForTests();
    const imageRef = 'data:image/png;base64,loyalty-card';
    cacheAnalysisForImageRef(imageRef, {
      evidenceId: 'ev_cached',
      attachmentAnalysis: {
        artifactType: 'loyalty_card',
        ocrText: 'Coffee Free',
        preseededDraft: {
          cardTopology: { rows: 4, columns: 8, cells: [{ role: 'PURCHASE' }], source: 'VISION_EXTRACTED' },
        },
      },
    });

    const hydrated = hydrateAttachmentAnalysisFromFrozenBundle({
      imageRef,
      evidenceView: { evidenceId: 'ev_bundle' },
      snapshot: { ocrText: 'fallback ocr' },
    });

    expect(hydrated?.artifactType).toBe('loyalty_card');
    expect(hydrated?.preseededDraft?.cardTopology?.rows).toBe(4);
    expect(hydrated?.evidenceId).toBe('ev_cached');
  });

  it('hydrateAttachmentAnalysisFromFrozenBundle falls back to snapshot OCR', () => {
    const hydrated = hydrateAttachmentAnalysisFromFrozenBundle({
      imageRef: 'data:image/png;base64,uncached',
      snapshot: { ocrText: 'Coffee Coffee Free' },
    });
    expect(hydrated?.ocrText).toBe('Coffee Coffee Free');
    expect(hydrated?.artifactType).toBe('loyalty_card');
  });
});
