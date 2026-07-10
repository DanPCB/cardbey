/**
 * @vitest-environment node
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { recordAttachmentIngestSidecar } from '../../attachmentRealityStreamSidecar.js';
import { __clearRealityStreamStoreForTests } from '../../ingress.js';
import { __clearPassiveCognitiveStoreForTests } from '../../passive/persist.js';
import { recordCognitiveParityComparison } from '../../passive/parityLog.js';
import { buildDecisionRecord, buildDecisionRecordFromParity } from '../buildDecisionRecord.js';
import { classifyDisagreement } from '../classifyDisagreement.js';
import { calculateConfidenceDelta } from '../confidenceDelta.js';
import { buildDecisionCalibrationMetrics } from '../calibrationMetrics.js';
import { buildCalibrationDashboardData } from '../calibrationDashboardData.js';
import {
  __clearCalibrationStoreForTests,
  getDecisionRecord,
  listDecisionRecords,
} from '../calibrationStore.js';

describe('Phase 3 decision calibration', () => {
  beforeEach(() => {
    __clearRealityStreamStoreForTests();
    __clearPassiveCognitiveStoreForTests();
    __clearCalibrationStoreForTests();
  });

  it('top1 agreement produces null disagreementReason and frozen record', () => {
    const streamId = 'reality:session:cal-top1';

    recordAttachmentIngestSidecar({
      streamId,
      sessionId: 'cal-top1',
      filename: 'loyalty-stamp.jpg',
      mimeType: 'image/jpeg',
      ocrText: 'Buy 8 stamps get free coffee loyalty rewards punch card',
    });

    recordCognitiveParityComparison({
      streamId,
      performerTool: 'setup_loyalty_program',
      performerConfidence: 0.91,
      intentReasonerTool: 'setup_loyalty_program',
      agreement: 'top1',
      tags: [],
    });

    const records = listDecisionRecords();
    expect(records.length).toBe(1);
    const record = records[0];
    expect(record.frozen).toBe(true);
    expect(record.calibration.agreement).toBe('top1');
    expect(record.calibration.disagreementReason).toBeNull();
    expect(record.kernel.topAlternative?.toolHint).toBe('setup_loyalty_program');
    expect(record.calibration.explanation).toMatch(/both selected loyalty/i);
  });

  it('campaign vs loyalty conflict requires human review', () => {
    const record = buildDecisionRecord({
      streamId: 'reality:session:conflict',
      userText: 'create promotion campaign for summer sale',
      performerTool: 'setup_loyalty_program',
      performerConfidence: 0.97,
      performerSource: 'loyalty_overrode_campaign',
      intentReasonerTool: 'create_campaign',
      agreement: 'disagree',
      tags: ['campaign_vs_loyalty', 'attachment_hijack', 'performer_override'],
      kernelAlternatives: [
        {
          id: 'alt_campaign',
          label: 'Marketing Campaign',
          toolHint: 'launch_campaign',
          family: 'campaign',
          score: 0.82,
        },
        {
          id: 'alt_loyalty',
          label: 'Loyalty Program',
          toolHint: 'setup_loyalty_program',
          family: 'loyalty',
          score: 0.55,
        },
      ],
    });

    expect(record?.calibration.disagreementReason).toBe('rule_conflict');
    expect(record?.calibration.requiresHumanReview).toBe(true);
    expect(record?.calibration.explanation).toMatch(/campaign vs loyalty|conflicted/i);
    expect(record?.selected.source).toBe('performer');
  });

  it('close-call alternatives classify as clarification_required', () => {
    const reason = classifyDisagreement({
      userText: 'help with this upload',
      performerTool: 'launch_campaign',
      kernelTopTool: 'import_catalog',
      agreement: 'disagree',
      tags: ['disagreement'],
      kernelAlternatives: [
        { id: 'a', label: 'A', toolHint: 'import_catalog', score: 0.61 },
        { id: 'b', label: 'B', toolHint: 'launch_campaign', score: 0.58 },
      ],
    });

    expect(reason).toBe('clarification_required');

    const record = buildDecisionRecordFromParity({
      streamId: 'reality:session:close',
      performerTool: 'launch_campaign',
      agreement: 'disagree',
      tags: ['disagreement'],
      kernelAlternatives: [
        { id: 'a', label: 'Import Catalog', toolHint: 'import_catalog', score: 0.61 },
        { id: 'b', label: 'Marketing Campaign', toolHint: 'launch_campaign', score: 0.58 },
      ],
    });

    expect(record?.calibration.disagreementReason).toBe('clarification_required');
  });

  it('missing context tag classifies as missing_context', () => {
    const reason = classifyDisagreement({
      agreement: 'disagree',
      tags: ['missing_context', 'disagreement'],
      performerTool: 'create_store',
      kernelTopTool: 'import_catalog',
    });
    expect(reason).toBe('missing_context');
  });

  it('calculateConfidenceDelta identifies stronger side', () => {
    const delta = calculateConfidenceDelta({
      performerConfidence: 0.97,
      kernelTopScore: 0.82,
    });
    expect(delta.delta).toBe(0.15);
    expect(delta.strongerSide).toBe('performer');
  });

  it('metrics mark readyForAuthority false when unexplained disagreements exist', () => {
    buildDecisionRecord({
      streamId: 'reality:session:m1',
      performerTool: 'launch_campaign',
      agreement: 'disagree',
      tags: ['disagreement'],
      kernelAlternatives: [
        { id: 'x', label: 'X', toolHint: 'import_catalog', score: 0.9 },
        { id: 'y', label: 'Y', toolHint: 'save_to_suitcase', score: 0.4 },
      ],
    });

    const metrics = buildDecisionCalibrationMetrics();
    expect(metrics.unexplainedDisagreementCount).toBeGreaterThan(0);
    expect(metrics.readiness.readyForAuthority).toBe(false);
    expect(metrics.readiness.gate2AllDisagreementsClassified).toBe(false);
  });

  it('decision record is immutable after save', () => {
    const record = buildDecisionRecord({
      streamId: 'reality:session:immutable',
      performerTool: 'setup_loyalty_program',
      agreement: 'top1',
      kernelAlternatives: [
        {
          id: 'alt_loyalty',
          label: 'Loyalty Program',
          toolHint: 'setup_loyalty_program',
          family: 'loyalty',
          score: 0.88,
        },
      ],
    });

    expect(record?.frozen).toBe(true);
    const loaded = getDecisionRecord(record.decisionRecordId);
    expect(loaded?.decisionRecordId).toBe(record?.decisionRecordId);
    expect(Object.isFrozen(loaded?.calibration)).toBe(true);
  });

  it('buildCalibrationDashboardData returns grouped summary', () => {
    buildDecisionRecord({
      streamId: 'reality:session:dash',
      performerTool: 'setup_loyalty_program',
      agreement: 'top1',
      tags: [],
      kernelAlternatives: [
        {
          id: 'alt_loyalty',
          label: 'Loyalty Program',
          toolHint: 'setup_loyalty_program',
          family: 'loyalty',
          score: 0.9,
        },
      ],
    });

    const dashboard = buildCalibrationDashboardData({ sinceMs: Date.now() - 86_400_000 });
    expect(dashboard.summary.total).toBeGreaterThan(0);
    expect(dashboard.recentDecisionRecords.length).toBeGreaterThan(0);
    expect(dashboard.summary.gates).toBeTruthy();
  });
});
