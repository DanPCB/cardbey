/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import {
  buildOcrFusionInput,
  buildVisualFusionInput,
  fuseUploadTopology,
} from '../loyaltyUploadTopologyFusion.js';
import { buildLoyaltyCardTopologyFromDetected } from '../loyaltyTopologyBuild.js';

function buildOcrTopology(rows, columns, purchasesPerRow) {
  const cells = [];
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < columns; col += 1) {
      const isReward = col >= purchasesPerRow;
      cells.push({
        row,
        column: col,
        role: isReward ? 'REWARD' : 'PURCHASE',
        text: isReward ? 'Free' : 'Coffee',
        confidence: 0.9,
      });
    }
  }
  return buildLoyaltyCardTopologyFromDetected(
    {
      rows,
      columns,
      cells,
      repeatedPattern: {
        direction: 'ROW',
        roles: [...Array(purchasesPerRow).fill('PURCHASE'), 'REWARD'],
        repetitions: rows,
        confidence: 0.9,
      },
      overallConfidence: 0.9,
    },
    { source: 'VISION_EXTRACTED' },
  );
}

describe('loyaltyUploadTopologyFusion', () => {
  it('overrides wrong OCR/LLM 3x7 layout with CV 4x8 geometry', () => {
    const ocrTopology = buildOcrTopology(3, 7, 6);
    const visualTopology = buildOcrTopology(4, 8, 7);

    const ocrResult = buildOcrFusionInput({
      topologyResult: {
        ok: true,
        extractionMethod: 'ocr_llm',
        cardTopology: ocrTopology,
        rule: {
          programType: 'STAMP_CARD',
          purchaseItem: 'Coffee',
          purchasesRequired: 6,
          rewardQuantity: 1,
          rewardItem: 'Free',
          repeatMode: 'INDEFINITE',
        },
      },
      ocrText: 'Coffee Coffee Coffee Coffee Coffee Coffee Free',
      rules: { stampsRequired: 6, confidence: 0.9 },
    });

    const visualResult = buildVisualFusionInput({
      success: true,
      source: 'visual_grid_detector',
      rows: 4,
      columns: 8,
      layout: '4x8',
      estimatedThreshold: 7,
      footerText: 'Catering Available',
      confidence: 0.88,
      rewardCells: [],
      rawGrid: {
        cells: Array.from({ length: 32 }, (_, i) => ({
          row: Math.floor(i / 8),
          column: i % 8,
          filled: true,
          isReward: i % 8 === 7,
        })),
      },
    });

    expect(visualResult.cardTopology?.rows).toBe(4);
    expect(visualResult.cardTopology?.columns).toBe(8);

    const fusion = fuseUploadTopology({
      visualDetection: {
        success: true,
        source: 'visual_grid_detector',
        rows: 4,
        columns: 8,
        layout: '4x8',
        estimatedThreshold: 7,
        footerText: 'Catering Available',
        confidence: 0.88,
        rewardCells: [],
        rawGrid: visualResult.cardTopology
          ? {
              cells: Array.from({ length: 32 }, (_, i) => ({
                row: Math.floor(i / 8),
                column: i % 8,
                filled: true,
                isReward: i % 8 === 7,
              })),
            }
          : null,
      },
      topologyResult: {
        ok: true,
        extractionMethod: 'ocr_llm',
        cardTopology: ocrTopology,
        rule: ocrResult.cardTopology
          ? {
              programType: 'STAMP_CARD',
              purchaseItem: 'Coffee',
              purchasesRequired: 6,
              rewardQuantity: 1,
              rewardItem: 'Free',
              repeatMode: 'INDEFINITE',
            }
          : null,
      },
      ocrText: 'Coffee Coffee Coffee Coffee Coffee Coffee Free',
      rules: { stampsRequired: 6, confidence: 0.9 },
    });

    expect(fusion.applied).toBe(true);
    expect(fusion.cardTopology?.rows).toBe(4);
    expect(fusion.cardTopology?.columns).toBe(8);
    expect(fusion.layoutsDisagree).toBe(true);
    expect(fusion.extractionMethod).toMatch(/fusion_cv_override|visual_primary/);
    expect(ocrResult.detectedLayout).toBe('3x7');
  });

  it('overrides wrong CV 2x5 with OCR token grid 4x8 (one token per line)', () => {
    const ocrLines = [
      ...Array.from({ length: 28 }, () => 'Coffee'),
      ...Array.from({ length: 4 }, () => 'Free'),
      'Catering Available',
    ].join('\n');

    const fusion = fuseUploadTopology({
      visualDetection: {
        success: true,
        source: 'visual_grid_detector',
        rows: 2,
        columns: 5,
        layout: '2x5',
        estimatedThreshold: 8,
        confidence: 0.8,
        rewardCells: [],
        rawGrid: {
          cells: Array.from({ length: 10 }, (_, i) => ({
            row: Math.floor(i / 5),
            column: i % 5,
            filled: true,
            isReward: i % 5 === 4,
          })),
        },
      },
      topologyResult: { ok: false, error: 'empty_topology' },
      ocrText: ocrLines,
      rules: { stampsRequired: 8, confidence: 0.84 },
    });

    expect(fusion.applied).toBe(true);
    expect(fusion.cardTopology?.rows).toBe(4);
    expect(fusion.cardTopology?.columns).toBe(8);
    expect(fusion.rule?.purchasesRequired).toBe(7);
    expect(fusion.reason).toBe('ocr_token_grid_override_cv');
    expect(fusion.extractionMethod).toMatch(/ocr_token_override/);
    expect(fusion.layoutsDisagree).toBe(true);
  });

  it('keeps OCR layout when CV is below threshold', () => {
    const ocrTopology = buildOcrTopology(3, 7, 6);
    const fusion = fuseUploadTopology({
      visualDetection: {
        success: false,
        source: 'visual_grid_detector',
        confidence: 0.4,
        rows: 4,
        columns: 8,
        layout: '4x8',
        rewardCells: [],
      },
      topologyResult: {
        ok: true,
        extractionMethod: 'ocr_llm',
        cardTopology: ocrTopology,
        rule: {
          programType: 'STAMP_CARD',
          purchaseItem: 'Coffee',
          purchasesRequired: 6,
          rewardQuantity: 1,
          rewardItem: 'Free',
          repeatMode: 'INDEFINITE',
        },
      },
      ocrText: 'Coffee',
      rules: {},
    });

    expect(fusion.applied).toBe(false);
    expect(fusion.reason).toBe('cv_below_threshold');
  });
});
