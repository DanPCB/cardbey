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

import {
  buildAttachmentAnalysis,
  buildLoyaltyMissingFieldsClarify,
  detectLoyaltyCardVisualHints,
  formatAttachmentAnalysisMessage,
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

  it('smart defaults: high confidence reward+stamps clears missingFields and confirms', () => {
    const smartAnalysis = {
      artifactType: 'loyalty_card',
      visualHints: ['stamp_grid', 'reward_program_candidate'],
      confidence: 0.82,
      ocrStatus: 'ok',
      ocrWarning: null,
      ocrText: 'Buy 8 get free latte',
      preseededDraft: {
        programName: 'Bean Bar Rewards',
        reward: 'Free latte',
        requiredStamps: 8,
        confidence: 0.82,
      },
      missingFields: [],
      confirmedFields: { reward: 'Free latte', requiredStamps: 8 },
      source: 'test',
    };
    expect(listMissingLoyaltyDraftFields(smartAnalysis.preseededDraft)).toEqual([]);
    const clarify = buildLoyaltyMissingFieldsClarify(smartAnalysis, { storeId: 'store_1' });
    expect(clarify.clarifyType).toBe('loyalty_confirm_defaults');
    expect(clarify.response).toMatch(/Reward: Free latte ✓/);
    expect(clarify.response).toMatch(/Visits: 8 ✓/);
    expect(clarify.response).toMatch(/Continue\?/);
    expect(clarify.options[0].label).toBe('Continue');
  });

  it('smart defaults: low confidence still asks for blanks', () => {
    const clarify = buildLoyaltyMissingFieldsClarify(
      {
        artifactType: 'loyalty_card',
        visualHints: ['stamp_grid'],
        confidence: 0.6,
        ocrStatus: 'ok',
        ocrWarning: null,
        ocrText: 'Buy 10 get free coffee',
        preseededDraft: { requiredStamps: null, reward: null },
        missingFields: ['requiredStamps', 'reward'],
        confirmedFields: null,
        source: 'test',
      },
      { storeId: 'store_1' },
    );
    expect(clarify.clarifyType).toBe('loyalty_missing_fields');
    expect(clarify.response).toMatch(/What reward should customers receive/);
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
