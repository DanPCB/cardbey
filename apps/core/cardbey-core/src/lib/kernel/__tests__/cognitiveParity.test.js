/**
 * @vitest-environment node
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { recordAttachmentIngestSidecar } from '../attachmentRealityStreamSidecar.js';
import { __clearRealityStreamStoreForTests } from '../ingress.js';
import {
  __clearPassiveCognitiveStoreForTests,
  listCognitiveParityRecords,
} from '../passive/persist.js';
import { recordCognitiveParityComparison } from '../passive/parityLog.js';
import { buildCognitiveParityMetrics } from '../passive/parityMetrics.js';
import { observeIntakeClassificationParity } from '../passive/intakeParityObserver.js';
import { __clearCalibrationStoreForTests } from '../calibration/calibrationStore.js';

describe('Cognitive parity observe/compare', () => {
  beforeEach(() => {
    __clearRealityStreamStoreForTests();
    __clearPassiveCognitiveStoreForTests();
    __clearCalibrationStoreForTests();
  });

  it('records top1 agreement with topKernelAlternative', () => {
    const streamId = 'reality:session:parity-top1';

    recordAttachmentIngestSidecar({
      streamId,
      sessionId: 'parity-top1',
      filename: 'loyalty-stamp.jpg',
      mimeType: 'image/jpeg',
      ocrText: 'Buy 8 stamps get free coffee loyalty rewards punch card',
    });

    const parity = recordCognitiveParityComparison({
      streamId,
      performerTool: 'setup_loyalty_program',
      performerConfidence: 0.91,
      intentReasonerTool: 'setup_loyalty_program',
    });

    expect(parity?.agreement).toBe('top1');
    expect(parity?.top1Agrees).toBe(true);
    expect(parity?.top3Agrees).toBe(true);
    expect(parity?.topKernelAlternative?.toolHint).toBe('setup_loyalty_program');
    expect(parity?.agrees).toBe(true);
  });

  it('tags campaign_vs_loyalty when IntentReasoner and Performer diverge', () => {
    const streamId = 'reality:session:parity-conflict';

    recordAttachmentIngestSidecar({
      streamId,
      sessionId: 'parity-conflict',
      filename: 'loyalty-stamp.jpg',
      mimeType: 'image/jpeg',
      ocrText: 'Buy 8 stamps get free coffee loyalty rewards punch card',
    });

    const parity = recordCognitiveParityComparison({
      streamId,
      intentReasonerTool: 'create_campaign',
      performerTool: 'setup_loyalty_program',
      performerConfidence: 0.97,
      classificationSource: 'loyalty_overrode_campaign',
      hasAttachment: true,
    });

    expect(parity?.tags).toContain('campaign_vs_loyalty');
    expect(parity?.tags).toContain('performer_override');
    expect(parity?.agreement).toBe('top1');
  });

  it('records top3 agreement when performer tool is in kernel top 3', () => {
    const streamId = 'reality:session:parity-top3';

    recordAttachmentIngestSidecar({
      streamId,
      sessionId: 'parity-top3',
      filename: 'menu.pdf',
      mimeType: 'application/pdf',
      ocrText: 'Espresso $4\nLatte $5\nCappuccino $5',
    });

    const parity = recordCognitiveParityComparison({
      streamId,
      performerTool: 'import_catalog',
      intentReasonerTool: 'launch_campaign',
    });

    expect(parity?.agreement).toBe('top1');
    expect(parity?.top3Agrees).toBe(true);
  });

  it('observeIntakeClassificationParity resolves stream from session key', () => {
    recordAttachmentIngestSidecar({
      streamId: 'reality:session:intake-key',
      sessionId: 'intake-key',
      filename: 'flyer.png',
      mimeType: 'image/png',
      ocrText: 'Summer sale 20% off all items',
    });

    observeIntakeClassificationParity({
      intakeAssetSessionKey: 'intake-key',
      performerTool: 'launch_campaign',
      intentReasonerTool: 'launch_campaign',
      performerConfidence: 0.82,
      hasAttachment: true,
    });

    const records = listCognitiveParityRecords('reality:session:intake-key');
    expect(records.length).toBe(1);
    expect(records[0]?.performerTool).toBe('launch_campaign');
  });

  it('buildCognitiveParityMetrics aggregates top1/top3 and disagreement examples', () => {
    const streamA = 'reality:session:metrics-a';
    const streamB = 'reality:session:metrics-b';

    recordAttachmentIngestSidecar({
      streamId: streamA,
      sessionId: 'metrics-a',
      filename: 'loyalty.jpg',
      ocrText: 'Buy 10 stamps get free coffee loyalty',
    });
    recordAttachmentIngestSidecar({
      streamId: streamB,
      sessionId: 'metrics-b',
      filename: 'menu.pdf',
      mimeType: 'application/pdf',
      ocrText: 'Espresso $4\nLatte $5',
    });

    recordCognitiveParityComparison({
      streamId: streamA,
      performerTool: 'setup_loyalty_program',
      intentReasonerTool: 'setup_loyalty_program',
    });
    recordCognitiveParityComparison({
      streamId: streamB,
      performerTool: 'launch_campaign',
      intentReasonerTool: 'import_catalog',
    });

    const metrics = buildCognitiveParityMetrics();
    expect(metrics.totalComparisons).toBe(2);
    expect(metrics.withKernelRun).toBe(2);
    expect(metrics.top1AgreementPct).toBe(50);
    expect(metrics.disagreementExamples.length).toBe(1);
  });
});
