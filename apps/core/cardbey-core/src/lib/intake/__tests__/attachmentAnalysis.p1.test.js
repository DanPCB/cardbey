/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../config/features.js', () => ({
  Features: {
    loyalty: { useSpine: true },
    compiler: { useForCampaigns: false, useForStores: false },
  },
  default: {
    loyalty: { useSpine: true },
  },
}));

vi.mock('../../loyalty/loyaltyTopologyExtraction.js', () => ({
  extractLoyaltyCardTopology: vi.fn(async () => ({ ok: false })),
}));

vi.mock('../../toolExecutors/loyalty/loyaltyCardVisionExtract.js', () => ({
  extractLoyaltyCardFromImage: vi.fn(async () => {
    const { buildLoyaltyCardTopologyFromDetected } = await import('../../loyalty/loyaltyTopologyBuild.js');
    const { inferRuleFromTopology } = await import('../../loyalty/loyaltyRuleInference.js');
    const { alignLegacyFieldsWithCanonicalRule } = await import('../../loyalty/loyaltyContractDiagnostics.js');
    const topology = buildLoyaltyCardTopologyFromDetected(
      {
        rows: 4,
        columns: 8,
        cells: Array.from({ length: 32 }, (_, i) => {
          const row = Math.floor(i / 8);
          const col = i % 8;
          return { row, column: col, role: col < 7 ? 'PURCHASE' : 'REWARD' };
        }),
        footerText: 'Catering Available',
        overallConfidence: 0.95,
      },
      { source: 'VISION_EXTRACTED' },
    );
    const rule = inferRuleFromTopology(topology, {
      purchaseItem: 'Coffee',
      rewardItem: 'Free Coffee',
    });
    return {
      ok: true,
      preseededDraft: alignLegacyFieldsWithCanonicalRule({
        rule,
        cardTopology: topology,
        cardFooterText: 'Catering Available',
        requiredStamps: 20,
        reward: 'Reward',
        extractedFromImage: true,
        confidence: 0.95,
      }),
    };
  }),
}));

import {
  buildAttachmentAnalysis,
  buildLoyaltyMissingFieldsClarify,
  detectLoyaltyCardVisualHints,
  formatAttachmentAnalysisMessage,
  inferLoyaltyStampGridFromOcr,
  isLoyaltyCardAttachment,
  listMissingLoyaltyDraftFields,
} from '../attachmentAnalysis.js';
import { softLoyaltyExtractCardFallback } from '../extractCardLoyaltySoft.js';

describe('P1 AttachmentAnalysis vision-first', () => {
  beforeEach(() => {
    process.env.USE_LOYALTY_SPINE = 'true';
    vi.clearAllMocks();
  });
  it('detects loyalty hints from filename and stamp language', () => {
    const hints = detectLoyaltyCardVisualHints({
      filename: 'loyalty-stamp-card.jpg',
      ocrText: 'Buy 10 get free coffee',
    });
    expect(hints).toContain('filename_loyalty');
    expect(hints).toContain('stamp_grid');
    expect(hints).toContain('reward_program_candidate');
  });

  it('preserves vision topology contract in preseeded draft without OCR matrix override', async () => {
    const analysis = await buildAttachmentAnalysis({
      filename: 'stamp-card.jpg',
      mimeType: 'image/jpeg',
      imageDataUrl: 'data:image/jpeg;base64,abc',
      ocrText: 'Coffee\nCoffee Free\nCatering Available',
      runVisionEnrichment: true,
      userMessage: '4x5+1free',
    });
    expect(analysis.preseededDraft?.cardTopology?.rows).toBe(4);
    expect(analysis.preseededDraft?.cardTopology?.columns).toBe(8);
    expect(analysis.preseededDraft?.rule?.purchasesRequired).toBe(7);
    expect(analysis.preseededDraft?.requiredStamps).toBe(7);
  });

  it('user matrix spec overrides only when topology is absent', async () => {
    const analysis = await buildAttachmentAnalysis({
      filename: 'stamp-card.jpg',
      mimeType: 'image/jpeg',
      imageDataUrl: 'data:image/jpeg;base64,abc',
      ocrText: 'Coffee',
      runVisionEnrichment: false,
      userMessage: '4x(7+1)',
    });
    expect(analysis.preseededDraft?.cardTopology?.rows).toBe(4);
    expect(analysis.preseededDraft?.cardTopology?.columns).toBe(8);
    expect(analysis.preseededDraft?.rule?.purchasesRequired).toBe(7);
  });

  it('OCR failure still yields loyalty_card for attachment-only upload', async () => {
    const analysis = await buildAttachmentAnalysis({
      filename: 'IMG_1234.jpg',
      mimeType: 'image/jpeg',
      imageDataUrl: 'data:image/jpeg;base64,abc',
      ocrText: null,
      ocrFailed: true,
      attachmentOnlyUpload: true,
      userMessage: '(Image attached)',
      runVisionEnrichment: false,
    });

    expect(analysis.artifactType).toBe('loyalty_card');
    expect(analysis.ocrStatus).toBe('failed');
    expect(analysis.ocrWarning).toBeTruthy();
    expect(isLoyaltyCardAttachment(analysis)).toBe(true);
    expect(formatAttachmentAnalysisMessage(analysis)).toMatch(/loyalty stamp card/i);
  });

  it('lists missing reward/stamps on partial draft', () => {
    expect(listMissingLoyaltyDraftFields({ requiredStamps: null, reward: null })).toEqual([
      'requiredStamps',
      'reward',
    ]);
    expect(listMissingLoyaltyDraftFields({ requiredStamps: 10, reward: 'Free coffee' })).toEqual([]);
  });

  it('buildLoyaltyMissingFieldsClarify asks for reward without OCR_FAILED', () => {
    const clarify = buildLoyaltyMissingFieldsClarify(
      {
        artifactType: 'loyalty_card',
        visualHints: ['stamp_grid'],
        confidence: 0.7,
        ocrStatus: 'failed',
        ocrWarning: 'Could not read enough text',
        ocrText: null,
        preseededDraft: { requiredStamps: null, reward: null },
        missingFields: ['requiredStamps', 'reward'],
        source: 'test',
      },
      { storeId: 'store_1' },
    );
    expect(clarify.action).toBe('clarify');
    expect(clarify.response).not.toMatch(/OCR_FAILED/);
    expect(clarify.pendingIntent.lockedIntent).toBe('setup_loyalty_program');
  });

  it('softLoyaltyExtractCardFallback returns ok soft on empty OCR', async () => {
    const soft = await softLoyaltyExtractCardFallback({
      extractedText: '',
      cardImageDataUrl: 'data:image/jpeg;base64,abc',
      filename: 'card.jpg',
    });
    expect(soft?.ok).toBe(true);
    expect(soft?.soft).toBe(true);
    expect(soft?.documentType).toBe('loyalty_card');
    expect(soft?.error).toBeUndefined();
  });
});
