/**
 * @vitest-environment node
 */
import { describe, expect, it, beforeEach, vi } from 'vitest';

const extractLoyaltyCardFromImage = vi.hoisted(() =>
  vi.fn(async () => ({
    ok: true,
    ocrText: 'REWARDS CARD',
    preseededDraft: {
      programName: 'Cafe Rewards',
      requiredStamps: 8,
      reward: 'free coffee',
      confidence: 0.91,
      programType: 'stamp_card',
    },
  })),
);

vi.mock('../../toolExecutors/loyalty/loyaltyCardVisionExtract.js', () => ({
  extractLoyaltyCardFromImage,
}));

import { buildAttachmentAnalysis } from '../../intake/attachmentAnalysis.js';
import { ingestAssetForIntentDetection } from '../../intake/assetIntentIngestService.js';
import {
  __clearRealityStreamStoreForTests,
  selectStreamWindow,
} from '../ingress.js';

describe('Reality Stream attachment ingest sidecar (Phase 1)', () => {
  beforeEach(() => {
    __clearRealityStreamStoreForTests();
  });

  it('appends upload, ocr, and session events without mission classification', async () => {
    await buildAttachmentAnalysis({
      filename: 'stamp-card.jpg',
      mimeType: 'image/jpeg',
      imageDataUrl: 'data:image/jpeg;base64,abc',
      ocrText: 'Buy 10 get free coffee',
      sessionId: 'sess-abc',
      fileAssetId: 'file-123',
      runVisionEnrichment: false,
    });

    const events = selectStreamWindow({ streamId: 'reality:session:sess-abc' });
    expect(events.length).toBeGreaterThanOrEqual(3);

    const kinds = events.map((e) => e.kind);
    expect(kinds).toContain('session_context');
    expect(kinds).toContain('user_upload');
    expect(kinds).toContain('ocr_output');
    expect(kinds).not.toContain('vision_output');

    const serialized = JSON.stringify(events);
    expect(serialized).not.toMatch(/artifactType|documentType|missionFamily|setup_loyalty/);

    const ocrEvent = events.find((e) => e.kind === 'ocr_output');
    expect(ocrEvent?.observations[0]?.payload?.text).toContain('Buy 10');
  });

  it('does not change AttachmentAnalysis return shape', async () => {
    const analysis = await buildAttachmentAnalysis({
      filename: 'loyalty.jpg',
      ocrText: 'Buy 8 stamps get free latte',
      runVisionEnrichment: false,
    });
    expect(analysis.artifactType).toBe('loyalty_card');
    expect(analysis.ocrStatus).toBe('ok');
  });

  it('records vision_output when enrichment runs', async () => {
    const prevSpine = process.env.USE_LOYALTY_SPINE;
    process.env.USE_LOYALTY_SPINE = 'true';
    extractLoyaltyCardFromImage.mockClear();

    try {
      await buildAttachmentAnalysis({
        filename: 'loyalty-card.png',
        mimeType: 'image/png',
        imageDataUrl: 'data:image/png;base64,xyz',
        ocrText: 'Buy 8 stamps get free latte',
        sessionId: 'sess-vision',
        runVisionEnrichment: true,
      });

      expect(extractLoyaltyCardFromImage).toHaveBeenCalled();

      const events = selectStreamWindow({ streamId: 'reality:session:sess-vision' });
      const vision = events.find((e) => e.kind === 'vision_output');
      expect(vision).toBeTruthy();
      expect(vision?.observations[0]?.payload?.extractedFields?.reward).toBe('free coffee');
      expect(JSON.stringify(vision)).not.toMatch(/artifactType|missionFamily/);
    } finally {
      if (prevSpine === undefined) delete process.env.USE_LOYALTY_SPINE;
      else process.env.USE_LOYALTY_SPINE = prevSpine;
    }
  });

  it('ingestAssetForIntentDetection appends upload and ocr without documentType in stream', async () => {
    await ingestAssetForIntentDetection({
      fileAssetId: 'asset-99',
      filename: 'menu.pdf',
      mimeType: 'application/pdf',
      sessionId: 'sess-ingest',
      rawOcrText: 'Espresso $4\nLatte $5',
      source: 'performer_composer',
    });

    const events = selectStreamWindow({ streamId: 'reality:session:sess-ingest' });
    expect(events.some((e) => e.kind === 'user_upload')).toBe(true);
    expect(events.some((e) => e.kind === 'ocr_output')).toBe(true);
    expect(JSON.stringify(events)).not.toMatch(/documentType|suggestedActions|launch_campaign/);
  });
});
