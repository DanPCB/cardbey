import { describe, expect, it, vi } from 'vitest';
import { buildDocumentTopologyFromDetected, buildTopologyConfidenceBreakdown } from '../documentTopologyInference.js';
import { validateDocumentTopology } from '../documentTopologyValidation.js';
import { DocumentTopologyEngine } from '../DocumentTopologyEngine.js';
import { interpretDetectedDocument, listRegisteredDocumentTypes } from '../DocumentInterpreterRegistry.js';
import { mergeOwnerTopologyIntoDraft } from '../documentTopologyOwnerInput.js';
import '../LoyaltyTopologyInterpreter.js';

function coffeeDetected() {
  const cells = [];
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 8; col++) {
      cells.push({
        row,
        column: col,
        role: col < 7 ? 'PURCHASE' : 'REWARD',
        text: col < 7 ? 'Coffee' : 'Free',
        confidence: 0.95,
      });
    }
  }
  return {
    rows: 4,
    columns: 8,
    cells,
    repeatedPattern: {
      direction: 'ROW',
      roles: [...Array(7).fill('PURCHASE'), 'REWARD'],
      repetitions: 4,
      confidence: 0.95,
    },
    footerText: 'Catering Available',
    purchaseItemHint: 'Coffee',
    rewardItemHint: 'Free Coffee',
    overallConfidence: 0.95,
  };
}

describe('DocumentTopologyEngine phase 2', () => {
  it('registers loyalty interpreter', () => {
    expect(listRegisteredDocumentTypes()).toContain('LOYALTY_CARD');
  });

  it('builds generic document topology with evidence', () => {
    const topology = buildDocumentTopologyFromDetected(coffeeDetected(), {
      documentType: 'LOYALTY_CARD',
      source: 'VISION_EXTRACTED',
    });
    expect(topology).toBeTruthy();
    expect(topology.documentType).toBe('LOYALTY_CARD');
    expect(topology.evidence?.boundedCellCount).toBe(32);
    expect(topology.evidence?.repeatedPatternDetected).toBe(true);
    const validation = validateDocumentTopology(topology);
    expect(validation.valid).toBe(true);
  });

  it('interprets loyalty topology + rule via registry', () => {
    const result = interpretDetectedDocument(coffeeDetected(), 'LOYALTY_CARD', {
      purchaseItemHint: 'Coffee',
      rewardItemHint: 'Free Coffee',
    });
    expect(result.ok).toBe(true);
    expect(result.topology.rows).toBe(4);
    expect(result.rule?.purchasesRequired).toBe(7);
  });

  it('builds confidence breakdown from evidence', () => {
    const topology = buildDocumentTopologyFromDetected(coffeeDetected(), {
      documentType: 'LOYALTY_CARD',
    });
    const breakdown = buildTopologyConfidenceBreakdown(topology);
    expect(breakdown.overall).toBeCloseTo(0.95);
    expect(breakdown.detected.find((d) => d.key === 'grid')?.ok).toBe(true);
    expect(breakdown.detected.find((d) => d.key === 'rows')?.label).toContain('4');
  });

  it('applies owner-defined override and preserves original extraction', () => {
    const original = buildDocumentTopologyFromDetected(coffeeDetected(), {
      documentType: 'LOYALTY_CARD',
      source: 'VISION_EXTRACTED',
    });
    const edited = {
      ...original,
      cells: original.cells.map((c) =>
        c.column === 7 ? { ...c, role: 'REWARD', label: 'Free Coffee' } : c,
      ),
    };
    const merged = mergeOwnerTopologyIntoDraft(
      { cardTopology: original },
      { cardTopology: edited, topologyAction: 'EDIT' },
      { missionId: 'mission-1', userId: 'owner-1' },
    );
    expect(merged.cardTopology.source).toBe('OWNER_DEFINED');
  });

  it('skips rescan overwrite semantics via owner-defined source', () => {
    const ownerDefined = buildDocumentTopologyFromDetected(coffeeDetected(), {
      documentType: 'LOYALTY_CARD',
      source: 'OWNER_DEFINED',
    });
    const merged = mergeOwnerTopologyIntoDraft(
      { cardTopology: ownerDefined },
      {},
      { missionId: 'mission-1' },
    );
    expect(merged.cardTopology.source).toBe('OWNER_DEFINED');
  });

  it('emits explainability from detection evidence', () => {
    const extracted = DocumentTopologyEngine.extractDocumentTopology(coffeeDetected(), 'LOYALTY_CARD');
    expect(extracted.ok).toBe(true);
    expect(extracted.explainability?.length).toBeGreaterThan(2);
    expect(extracted.explainability?.some((line) => /bounded cells/i.test(line))).toBe(true);
  });

  it('telemetry does not include OCR text', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    DocumentTopologyEngine.extractDocumentTopology(
      { ...coffeeDetected(), ocrText: 'secret ocr content' },
      'LOYALTY_CARD',
    );
    const logged = spy.mock.calls.map((c) => String(c[1] ?? '')).join('\n');
    expect(logged).not.toContain('secret ocr content');
    spy.mockRestore();
  });
});
