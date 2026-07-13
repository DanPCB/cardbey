/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import {
  assertLoyaltyCardEvidenceBound,
  hydrateLoyaltyAttachmentEvidenceForFollowUp,
  hydrateAttachmentAnalysisFromIntakeEvidence,
  bindFrozenEvidenceToPreseeded,
  resolveIntakeHasAttachment,
} from '../intakeAttachmentBinding.js';
import {
  __clearAttachmentEvidenceRegistryForTests,
  cacheAnalysisForImageRef,
} from '../attachmentEvidenceRegistry.js';
import { __clearIntakeEvidenceStoreForTests, saveIntakeEvidenceBundle } from '../../kernel/ingress/evidenceStore.js';
import { stashIntakeWorkflowContext, clearIntakeWorkflowContextForTests } from '../intakeWorkflowContext.js';

describe('intake attachment binding', () => {
  it('hasAttachment is true when evidenceId is present without raw image', () => {
    expect(resolveIntakeHasAttachment({ evidenceId: 'ev_123' })).toBe(true);
    expect(resolveIntakeHasAttachment({ attachmentId: 'att_abc' })).toBe(true);
    expect(resolveIntakeHasAttachment({ intentSourceContext: { evidenceId: 'ev_456' } })).toBe(true);
  });

  it('requires evidence binding for "from this card" loyalty requests', () => {
    const bound = assertLoyaltyCardEvidenceBound({
      userMessage: 'create a loyalty program from this card',
      body: { evidenceId: 'ev_1', storeId: 'store-1' },
      attachmentAnalysis: { preseededDraft: { cardTopology: { rows: 4, columns: 8, cells: [] } } },
    });
    expect(bound.ok).toBe(true);

    const missing = assertLoyaltyCardEvidenceBound({
      userMessage: 'create a loyalty program from this card',
      body: { storeId: 'store-1' },
      attachmentAnalysis: null,
    });
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.code).toBe('ATTACHMENT_EVIDENCE_NOT_BOUND');
  });

  it('hydrates loyalty follow-up evidence from session stream', () => {
    __clearIntakeEvidenceStoreForTests();
    clearIntakeWorkflowContextForTests();
    const sessionKey = 'sess-loyalty-followup';
    saveIntakeEvidenceBundle({
      streamId: `reality:session:${sessionKey}`,
      evidenceView: { evidenceId: 'ev_session_1', confidence: 1, source: 'test' },
      perceptionFrame: { interpretations: [], entities: [], confidence: 1 },
      snapshot: {
        ocrText: 'Coffee',
        ocrStatus: 'ok',
        ocrProvider: 'test',
        ocrError: null,
        visionObservations: null,
        uploadMetadata: {
          filename: null,
          mimeType: null,
          fileAssetId: null,
          hasImageRef: true,
        },
        interpretations: [],
        entities: [],
        confidence: 1,
      },
      timing: {
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        totalMs: 1,
        realityStreamMs: 0,
        perceptionMs: 0,
        evidenceMs: 0,
        ocrMs: 0,
        attachmentAnalysisMs: 0,
      },
    });
    stashIntakeWorkflowContext(sessionKey, {
      uploadedAsset: {
        attachmentAnalysis: {
          artifactType: 'LOYALTY_CARD',
          preseededDraft: { cardTopology: { rows: 3, columns: 9, cells: [] } },
        },
        intakeEvidenceId: 'ev_session_1',
      },
    });

    const hydrated = hydrateLoyaltyAttachmentEvidenceForFollowUp({
      userMessage: 'create a loyalty program from this card',
      body: { storeId: 'store-1' },
      intakeAssetSessionKey: sessionKey,
      intakeEvidenceBundle: null,
      attachmentAnalysis: null,
    });
    const bound = assertLoyaltyCardEvidenceBound({
      userMessage: 'create a loyalty program from this card',
      body: { storeId: 'store-1' },
      intakeEvidenceBundle: hydrated.intakeEvidenceBundle,
      attachmentAnalysis: hydrated.attachmentAnalysis,
    });
    expect(bound.ok).toBe(true);
  });

  it('hydrates cached attachment analysis by evidence id', () => {
    __clearAttachmentEvidenceRegistryForTests();
    const imageRef = 'https://cdn.example/loyalty-card.png';
    cacheAnalysisForImageRef(imageRef, {
      evidenceId: 'ev_cached_1',
      attachmentAnalysis: {
        artifactType: 'loyalty_card',
        ocrText: 'Coffee Free',
        preseededDraft: {
          cardTopology: { source: 'VISION_EXTRACTED', rows: 4, columns: 8, cells: [{ row: 0, column: 0, role: 'PURCHASE' }] },
          imageAssetId: imageRef,
        },
      },
    });

    const hydrated = hydrateAttachmentAnalysisFromIntakeEvidence(null, {
      evidenceId: 'ev_cached_1',
      imageRef,
    });
    expect(hydrated?.preseededDraft?.cardTopology?.rows).toBe(4);
    expect(hydrated?.preseededDraft?.cardTopology?.columns).toBe(8);
    expect(hydrated?.imageUrl).toBe(imageRef);
  });

  it('freezes evidence ids onto preseeded draft', () => {
    __clearAttachmentEvidenceRegistryForTests();
    const frozen = bindFrozenEvidenceToPreseeded(
      { cardTopology: { rows: 4 }, extractedFromImage: true },
      { evidenceId: 'ev_99', storeId: 'store-1', missionId: 'mission-1' },
    );
    expect(frozen.evidenceId).toBe('ev_99');
    expect(frozen.sourceMode).toBe('SOURCE_DRIVEN');
    expect(frozen.storeId).toBe('store-1');
  });

  it('does not prefer stale cached topology when OCR grid disagrees', () => {
    __clearAttachmentEvidenceRegistryForTests();
    const imageRef = 'data:image/png;base64,stale-cache-test';
    const ocrText = [
      'Coffee Coffee Coffee Coffee Coffee Coffee Coffee Free',
      'Coffee Coffee Coffee Coffee Coffee Coffee Coffee Free',
      'Coffee Coffee Coffee Coffee Coffee Coffee Coffee Free',
      'Coffee Coffee Coffee Coffee Coffee Coffee Coffee Free',
    ].join('\n');
    const staleCells = Array.from({ length: 10 }, (_, i) => ({
      row: Math.floor(i / 5),
      column: i % 5,
      role: i % 5 === 4 ? 'REWARD' : 'PURCHASE',
    }));
    cacheAnalysisForImageRef(imageRef, {
      evidenceId: 'ev_stale',
      attachmentAnalysis: {
        artifactType: 'loyalty_card',
        ocrText,
        preseededDraft: {
          cardTopology: {
            source: 'VISION_EXTRACTED',
            rows: 2,
            columns: 5,
            cells: staleCells,
          },
        },
      },
    });

    const hydrated = hydrateAttachmentAnalysisFromIntakeEvidence(
      { ocrText, artifactType: 'loyalty_card' },
      { imageRef },
    );
    expect(hydrated?.preseededDraft?.cardTopology?.rows).not.toBe(2);
    expect(hydrated?.preseededDraft?.cardTopology?.columns).not.toBe(5);
  });

  it('reconciles stale 2x5 topology from OCR token grid without vision re-run', async () => {
    const { ensureLoyaltyAttachmentAnalysisWithTopology } = await import('../intakeAttachmentBinding.js');
    const ocrText = [
      ...Array.from({ length: 28 }, () => 'Coffee'),
      ...Array.from({ length: 4 }, () => 'Free'),
    ].join('\n');
    const cells = Array.from({ length: 10 }, (_, i) => ({
      row: Math.floor(i / 5),
      column: i % 5,
      role: i % 5 === 4 ? 'REWARD' : 'PURCHASE',
    }));
    const stale = {
      artifactType: 'loyalty_card',
      ocrText,
      preseededDraft: {
        ocrText,
        cardTopology: {
          source: 'VISION_EXTRACTED',
          rows: 2,
          columns: 5,
          cells,
        },
      },
    };

    const result = await ensureLoyaltyAttachmentAnalysisWithTopology(stale, {});
    expect(result?.preseededDraft?.cardTopology?.rows).toBe(4);
    expect(result?.preseededDraft?.cardTopology?.columns).toBe(8);
    expect(result?.preseededDraft?.rule?.purchasesRequired).toBe(7);
  });
});
