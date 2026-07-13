/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import {
  buildDetectedGridFromMatrix,
  extractOcrFooterText,
  parseLoyaltyCardTopologyFromOcr,
  parseStampRowLine,
} from '../loyaltyOcrTopologyParser.js';
import { buildLoyaltyCardTopologyFromDetected } from '../loyaltyTopologyBuild.js';
import { inferRuleFromTopology } from '../loyaltyRuleInference.js';
import { validateLoyaltyCardTopology } from '../loyaltyTopologyValidation.js';

describe('loyaltyOcrTopologyParser', () => {
  it('parses a single stamp row line with 7 Coffee + Free', () => {
    const stats = parseStampRowLine('Coffee Coffee Coffee Coffee Coffee Coffee Coffee Free');
    expect(stats).toEqual({
      purchases: 7,
      rewards: 1,
      purchaseLabel: 'Coffee',
      rewardLabel: 'Free',
    });
  });

  it('extracts Catering Available footer', () => {
    expect(extractOcrFooterText('Coffee Free\nCatering Available')).toBe('Catering Available');
  });

  it('parses 4×8 coffee card from repeated row lines', () => {
    const row = 'Coffee Coffee Coffee Coffee Coffee Coffee Coffee Free';
    const ocrText = `${row}\n${row}\n${row}\n${row}\nCatering Available`;
    const parsed = parseLoyaltyCardTopologyFromOcr(ocrText);
    expect(parsed?.method).toBe('ocr_stamp_row_lines');
    expect(parsed?.detected.rows).toBe(4);
    expect(parsed?.detected.columns).toBe(8);
    expect(parsed?.detected.footerText).toBe('Catering Available');

    const topology = buildLoyaltyCardTopologyFromDetected(parsed.detected);
    expect(topology?.cells.filter((c) => c.role === 'PURCHASE')).toHaveLength(28);
    expect(topology?.cells.filter((c) => c.role === 'REWARD')).toHaveLength(4);

    const rule = inferRuleFromTopology(topology, {
      purchaseItem: 'Coffee',
      rewardItem: 'Free',
    });
    expect(rule?.purchasesRequired).toBe(7);
    expect(rule?.fixedCardCycles).toBe(4);
    expect(validateLoyaltyCardTopology(topology).valid).toBe(true);
  });

  it('parses flat token OCR with 28 coffee + 4 free tokens', () => {
    const coffees = Array.from({ length: 28 }, () => 'Coffee');
    const frees = Array.from({ length: 4 }, () => 'Free');
    const tokens = [];
    for (let i = 0; i < 4; i++) {
      tokens.push(...coffees.slice(i * 7, i * 7 + 7), 'Free');
    }
    const ocrText = `${tokens.join(' ')}\nCatering Available`;
    const parsed = parseLoyaltyCardTopologyFromOcr(ocrText);
    expect(parsed).toBeTruthy();
    expect(parsed?.detected.rows).toBe(4);
    expect(parsed?.detected.columns).toBe(8);

    const rule = inferRuleFromTopology(buildLoyaltyCardTopologyFromDetected(parsed.detected));
    expect(rule?.purchasesRequired).toBe(7);
    expect(rule?.purchasesRequired).not.toBe(8);
  });

  it('parses one-token-per-line OCR (28 Coffee lines + 4 Free lines)', () => {
    const lines = [
      ...Array.from({ length: 28 }, () => 'Coffee'),
      ...Array.from({ length: 4 }, () => 'Free'),
      'Catering Available',
    ];
    const ocrText = lines.join('\n');
    const parsed = parseLoyaltyCardTopologyFromOcr(ocrText);
    expect(parsed?.method).toBe('ocr_token_repetition');
    expect(parsed?.detected.rows).toBe(4);
    expect(parsed?.detected.columns).toBe(8);

    const rule = inferRuleFromTopology(buildLoyaltyCardTopologyFromDetected(parsed.detected));
    expect(rule?.purchasesRequired).toBe(7);
  });

  it('buildDetectedGridFromMatrix matches coffee card fixture dimensions', () => {
    const detected = buildDetectedGridFromMatrix(4, 7, 1, {
      footerText: 'Catering Available',
    });
    expect(detected.cells).toHaveLength(32);
    expect(detected.repeatedPattern?.repetitions).toBe(4);
  });
});
