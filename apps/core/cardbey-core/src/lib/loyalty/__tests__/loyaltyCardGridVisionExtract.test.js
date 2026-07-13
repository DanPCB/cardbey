/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import {
  expandVisionGridCells,
  parseLoyaltyCardGridVisionJson,
  reconcilePatternRoles,
  isStrongGptGridVisionResult,
  EXTRACTION_METHOD_GPT_GRID_VISION,
} from '../loyaltyCardGridVisionExtract.js';
import { fuseUploadTopology } from '../loyaltyUploadTopologyFusion.js';
import { buildLoyaltyCardTopologyFromDetected } from '../loyaltyTopologyBuild.js';

describe('loyaltyCardGridVisionExtract', () => {
  it('parses 4x8 grid JSON from GPT vision response', () => {
    const raw = JSON.stringify({
      rows: 4,
      columns: 8,
      repeatedPattern: {
        direction: 'ROW',
        roles: ['PURCHASE', 'PURCHASE', 'PURCHASE', 'PURCHASE', 'PURCHASE', 'PURCHASE', 'PURCHASE', 'REWARD'],
        repetitions: 4,
        confidence: 0.95,
      },
      footerText: 'Catering Available',
      purchaseItemHint: 'Coffee',
      rewardItemHint: 'Free',
      overallConfidence: 0.95,
    });

    const parsed = parseLoyaltyCardGridVisionJson(raw);
    expect(parsed?.detected?.rows).toBe(4);
    expect(parsed?.detected?.columns).toBe(8);
    expect(parsed?.detected?.cells?.length).toBe(32);
    expect(parsed?.detected?.footerText).toBe('Catering Available');
  });

  it('expands sparse cells from rows/columns/pattern', () => {
    const detected = expandVisionGridCells({
      rows: 4,
      columns: 8,
      repeatedPattern: {
        direction: 'ROW',
        roles: Array(7).fill('PURCHASE').concat('REWARD'),
        repetitions: 4,
      },
      footerText: 'Catering Available',
      overallConfidence: 0.9,
    });
    expect(detected?.rows).toBe(4);
    expect(detected?.columns).toBe(8);
    expect(detected?.cells?.length).toBe(32);
  });

  it('reconciles declared columns when pattern is short (8 cols, 6+1 roles)', () => {
    const reconciled = reconcilePatternRoles(
      8,
      [...Array(6).fill('PURCHASE'), 'REWARD'],
    );
    expect(reconciled.columns).toBe(8);
    expect(reconciled.roles.filter((role) => role === 'PURCHASE').length).toBe(7);
    expect(reconciled.roles.filter((role) => role === 'REWARD').length).toBe(1);

    const detected = expandVisionGridCells({
      rows: 4,
      columns: 8,
      repeatedPattern: {
        direction: 'ROW',
        roles: reconciled.roles,
        repetitions: 4,
      },
      overallConfidence: 0.9,
    });
    expect(detected?.columns).toBe(8);
    expect(detected?.cells?.length).toBe(32);
  });

  it('pads dense but incomplete cell lists to full rows x columns', () => {
    const cells = [];
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 7; col++) {
        cells.push({
          row,
          column: col,
          role: col === 6 ? 'REWARD' : 'PURCHASE',
          text: col === 6 ? 'Free' : 'Coffee',
        });
      }
    }
    const detected = expandVisionGridCells({
      rows: 4,
      columns: 8,
      cells,
      repeatedPattern: {
        direction: 'ROW',
        roles: [...Array(6).fill('PURCHASE'), 'REWARD'],
        repetitions: 4,
      },
      overallConfidence: 0.9,
    });
    expect(detected?.columns).toBe(8);
    expect(detected?.cells?.length).toBe(32);
    expect(detected?.cells?.filter((cell) => cell.role === 'PURCHASE').length).toBe(28);
  });

  it('isStrongGptGridVisionResult accepts high-confidence grid vision', () => {
    const cardTopology = buildLoyaltyCardTopologyFromDetected(
      expandVisionGridCells({
        rows: 4,
        columns: 8,
        repeatedPattern: {
          direction: 'ROW',
          roles: Array(7).fill('PURCHASE').concat('REWARD'),
          repetitions: 4,
        },
        overallConfidence: 0.92,
      }),
      { source: 'VISION_EXTRACTED' },
    );
    expect(
      isStrongGptGridVisionResult({
        cardTopology,
        extractionMethod: EXTRACTION_METHOD_GPT_GRID_VISION,
        confidence: 0.92,
      }),
    ).toBe(true);
  });
});

describe('fuseUploadTopology gpt grid primary', () => {
  it('prefers gpt4o grid vision over CV/OCR disagreement', () => {
    const detected = expandVisionGridCells({
      rows: 4,
      columns: 8,
      repeatedPattern: {
        direction: 'ROW',
        roles: Array(7).fill('PURCHASE').concat('REWARD'),
        repetitions: 4,
      },
      footerText: 'Catering Available',
      overallConfidence: 0.95,
    });
    const cardTopology = buildLoyaltyCardTopologyFromDetected(detected, {
      source: 'VISION_EXTRACTED',
    });

    const fused = fuseUploadTopology({
      preferVisionGrid: true,
      topologyResult: {
        ok: true,
        cardTopology,
        extractionMethod: EXTRACTION_METHOD_GPT_GRID_VISION,
      },
      visualDetection: {
        success: true,
        rows: 2,
        columns: 5,
        confidence: 0.8,
        layout: '2x5',
      },
      ocrText: 'Coffee Coffee Coffee Coffee Free',
    });

    expect(fused.applied).toBe(true);
    expect(fused.reason).toBe('gpt4o_grid_vision_primary');
    expect(fused.cardTopology?.rows).toBe(4);
    expect(fused.cardTopology?.columns).toBe(8);
  });
});
