/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import { fuseTopologyResults, calculateFusionConfidence } from '../topologyFusion.js';
import { hasAuthoritativeLoyaltyTopology } from '../loyaltyContractDiagnostics.js';

describe('topologyFusion', () => {
  it('fuses visual layout with OCR stamp threshold', () => {
    const visual = {
      source: 'graph_visual_grid',
      confidence: 0.88,
      rows: 2,
      columns: 5,
      layout: '2x5',
      cardTopology: null,
    };
    const ocr = {
      source: 'ocr_text_only',
      confidence: 0.62,
      rows: null,
      columns: null,
      stampThreshold: 8,
      buyGetRule: { buy: 8, get: 1 },
      footerText: null,
      purchaseItemHint: 'visit',
      rewardItemHint: 'Reward perk',
      cardTopology: null,
    };

    const fused = fuseTopologyResults(visual, ocr);
    expect(fused.topology.rows).toBe(2);
    expect(fused.topology.columns).toBe(5);
    expect(fused.stampThreshold).toBe(8);
    expect(fused.rule?.purchasesRequired).toBe(8);
    expect(hasAuthoritativeLoyaltyTopology(fused.topology)).toBe(true);
    expect(fused.confidence).toBeGreaterThan(0.6);
  });

  it('rewards layout agreement between visual and OCR', () => {
    const base = calculateFusionConfidence(
      { source: 'v', confidence: 0.85, rows: 2, columns: 5, layout: '2x5' },
      { source: 'o', confidence: 0.75, rows: 2, columns: 5, detectedLayout: '2x5' },
    );
    const noAgreement = calculateFusionConfidence(
      { source: 'v', confidence: 0.85, rows: 2, columns: 5, layout: '2x5' },
      { source: 'o', confidence: 0.75, rows: 4, columns: 8, detectedLayout: '4x8' },
    );
    expect(base).toBeGreaterThan(noAgreement);
  });
});
