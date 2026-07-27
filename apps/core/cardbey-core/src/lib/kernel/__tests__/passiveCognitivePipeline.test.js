/**
 * @vitest-environment node
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { recordAttachmentIngestSidecar } from '../attachmentRealityStreamSidecar.js';
import {
  appendRealityStreamEvent,
  __clearRealityStreamStoreForTests,
} from '../ingress.js';
import {
  __clearPassiveCognitiveStoreForTests,
  getLatestPassiveCognitiveRun,
  getPassiveCognitiveRunsForStream,
} from '../passive/persist.js';
import { recordCognitiveParityComparison } from '../passive/parityLog.js';
import { runPassiveCognitivePipeline } from '../passive/passivePipeline.js';

describe('Phase 2 passive cognitive pipeline', () => {
  beforeEach(() => {
    __clearRealityStreamStoreForTests();
    __clearPassiveCognitiveStoreForTests();
  });

  it('produces perception, evidence, reasoning, and alternatives without executing', () => {
    const streamId = 'reality:session:phase2-test';

    recordAttachmentIngestSidecar({
      streamId,
      sessionId: 'phase2-test',
      filename: 'menu.pdf',
      mimeType: 'application/pdf',
      ocrText: 'Espresso $4\nLatte $5\nCappuccino $5',
      ingestCorrelationId: 'corr-1',
      userGoal: 'uploaded menu',
    });

    const run = getLatestPassiveCognitiveRun(streamId);
    expect(run).toBeTruthy();
    expect(run?.perceptionFrame.interpretations.length).toBeGreaterThan(0);
    expect(run?.evidenceView.frozenAt).toBeTruthy();
    expect(run?.reasoningFrame.alternatives.length).toBeGreaterThan(1);

    const top = run?.reasoningFrame.alternatives[0];
    expect(top?.label).toMatch(/Import Catalog|Translate Menu/i);
    expect(top?.score).toBeGreaterThan(0.7);

    const labels = run?.reasoningFrame.alternatives.map((a) => a.label) ?? [];
    expect(labels.some((l) => /Campaign|Flyer/i.test(l))).toBe(false);

    expect(run?.perceptionFrame.interpretations.some((i) => i.entityKind === 'menu_document_cues')).toBe(
      true,
    );
    expect(
      run?.perceptionFrame.interpretations.every(
        (i) => !String(i.entityKind).includes('mission'),
      ),
    ).toBe(true);
  });

  it('loyalty upload proposes multiple alternatives including loyalty and campaign paths', () => {
    const streamId = 'reality:ingest:loyalty-corr';

    appendRealityStreamEvent({
      eventId: 'e1',
      streamId,
      recordedAt: new Date().toISOString(),
      kind: 'user_upload',
      payloadRef: 'loyalty.jpg',
      observations: [
        {
          observationId: 'o1',
          kind: 'file_metadata',
          payload: { filename: 'loyalty-stamp.jpg', mimeType: 'image/jpeg' },
          detector: 'attachment_ingest',
        },
      ],
    });
    appendRealityStreamEvent({
      eventId: 'e2',
      streamId,
      recordedAt: new Date().toISOString(),
      kind: 'ocr_output',
      observations: [
        {
          observationId: 'o2',
          kind: 'ocr_text',
          payload: { text: 'Buy 10 stamps get free coffee', textLength: 28, status: 'ok' },
          detector: 'ocr_provider',
        },
      ],
    });

    const run = runPassiveCognitivePipeline({ streamId });
    expect(run).toBeTruthy();

    const alts = run?.reasoningFrame.alternatives ?? [];
    expect(alts.some((a) => a.toolHint === 'setup_loyalty_program')).toBe(true);
    expect(alts.length).toBeGreaterThan(1);
    expect(alts[0]?.score).toBeGreaterThan(alts[1]?.score ?? 0);
  });

  it('parity comparison logs agreement without affecting routing', () => {
    const streamId = 'reality:session:parity';

    recordAttachmentIngestSidecar({
      streamId,
      sessionId: 'parity',
      filename: 'loyalty-stamp.jpg',
      mimeType: 'image/jpeg',
      ocrText: 'Buy 8 stamps get free coffee — loyalty rewards punch card',
    });

    const parity = recordCognitiveParityComparison({
      streamId,
      performerTool: 'setup_loyalty_program',
      performerConfidence: 0.91,
    });

    expect(parity?.agreement).toBe('top1');
    expect(parity?.top1Agrees).toBe(true);
    expect(parity?.kernelTopTool).toBe('setup_loyalty_program');
    expect(getPassiveCognitiveRunsForStream(streamId).length).toBe(1);
  });

  it('immutable evidence view references stream events without copying facts', () => {
    const streamId = 'reality:asset:ev-1';

    recordAttachmentIngestSidecar({
      streamId,
      fileAssetId: 'ev-1',
      filename: 'flyer.png',
      mimeType: 'image/png',
      ocrText: 'Summer sale 20% off all items',
    });

    const run = getLatestPassiveCognitiveRun(streamId);
    expect(run?.evidenceView.eventIds.length).toBeGreaterThan(0);
    expect(run?.evidenceView.realityStreamId).toBe(streamId);
    expect(run?.evidenceView.queryVersion).toBe('evidence.v1');
  });
});
