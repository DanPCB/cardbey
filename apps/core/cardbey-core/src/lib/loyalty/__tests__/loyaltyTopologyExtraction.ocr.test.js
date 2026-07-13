/**
 * @vitest-environment node
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../../ai/engines/index.js', () => ({
  getTextEngine: vi.fn(() => ({
    generateText: vi.fn(async () => {
      throw new Error('LLM should not be called when OCR parser succeeds');
    }),
  })),
}));

import { extractLoyaltyCardTopology } from '../loyaltyTopologyExtraction.js';

describe('extractLoyaltyCardTopology OCR-first', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses deterministic OCR parser for 4×8 coffee card without LLM', async () => {
    const row = 'Coffee Coffee Coffee Coffee Coffee Coffee Coffee Free';
    const ocrText = `${row}\n${row}\n${row}\n${row}\nCatering Available`;

    const result = await extractLoyaltyCardTopology({ ocrText, missionId: 'm_ocr' });

    expect(result.ok).toBe(true);
    expect(result.extractionMethod).toMatch(/^ocr_/);
    expect(result.cardTopology?.rows).toBe(4);
    expect(result.cardTopology?.columns).toBe(8);
    expect(result.cardTopology?.source).toBe('VISION_EXTRACTED');
    expect(result.cardTopology?.footerText).toBe('Catering Available');
    expect(result.rule?.purchasesRequired).toBe(7);
    expect(result.rule?.fixedCardCycles).toBe(4);
    expect(result.rule?.purchasesRequired).not.toBe(8);
  });
});
