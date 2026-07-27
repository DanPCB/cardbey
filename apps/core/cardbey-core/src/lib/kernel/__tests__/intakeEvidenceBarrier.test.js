/**
 * @vitest-environment node
 */
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { __clearRealityStreamStoreForTests } from '../ingress.js';
import { __clearPassiveCognitiveStoreForTests } from '../passive/persist.js';
import { __clearIntakeEvidenceStoreForTests } from '../ingress/evidenceStore.js';
import {
  runIntakeEvidenceBarrier,
  buildAwaitingPerceptionIntakeResponse,
} from '../ingress/intakeEvidenceBarrier.js';
import * as passivePipeline from '../passive/passivePipeline.js';
import { buildClassifierInputFromEvidence } from '../ingress/classifierEvidenceInput.js';
import {
  assertClassificationEvidenceGate,
  guardClassificationAgainstEvidence,
  IntakeEvidenceAssertionError,
} from '../ingress/evidenceAssertions.js';
import { isAttachmentOnlyPlaceholderMessage } from '../../intake/assetUploadGuard.js';

const GOLF_OCR =
  'GOLF TOUR IN PERTH\n4 ROUNDS OF GOLF\n1164 AUD per pax\nBook your golf adventure today';

describe('intake evidence barrier', () => {
  beforeEach(() => {
    __clearRealityStreamStoreForTests();
    __clearPassiveCognitiveStoreForTests();
    __clearIntakeEvidenceStoreForTests();
  });

  it('produces frozen EvidenceView before classification input is built', async () => {
    const result = await runIntakeEvidenceBarrier({
      hasAttachment: true,
      imageRef: 'data:image/png;base64,abc',
      filename: 'golf-tour.png',
      mimeType: 'image/png',
      userMessage: '(Image attached)',
      sessionId: 'sess-barrier-1',
      skipOcr: true,
      precomputedOcrText: GOLF_OCR,
      precomputedOcrProvider: 'test',
      attachmentOnlyUpload: true,
    });

    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;

    expect(result.bundle.evidenceView.evidenceId).toBeTruthy();
    expect(result.bundle.evidenceView.frozenAt).toBeTruthy();
    expect(result.bundle.snapshot.ocrText).toContain('GOLF TOUR');
    expect(result.bundle.timing.realityStreamMs).toBeGreaterThanOrEqual(0);
    expect(result.bundle.timing.perceptionMs).toBeGreaterThanOrEqual(0);
    expect(result.bundle.timing.evidenceMs).toBeGreaterThanOrEqual(0);

    const classifierInput = buildClassifierInputFromEvidence({
      userMessage: '(Image attached)',
      bundle: result.bundle,
    });
    expect(isAttachmentOnlyPlaceholderMessage(classifierInput)).toBe(false);
    expect(classifierInput).toContain('GOLF TOUR');
  });

  it('returns awaiting_perception when perception pipeline has not frozen evidence', async () => {
    vi.spyOn(passivePipeline, 'runPassiveCognitivePipeline').mockReturnValueOnce(null);

    const result = await runIntakeEvidenceBarrier({
      hasAttachment: true,
      imageRef: 'data:image/png;base64,abc',
      filename: 'flyer.png',
      mimeType: 'image/png',
      userMessage: '(Image attached)',
      sessionId: 'sess-await-1',
      skipOcr: true,
      precomputedOcrText: GOLF_OCR,
    });

    expect(result.status).toBe('awaiting_perception');
    if (result.status !== 'awaiting_perception') return;

    const response = buildAwaitingPerceptionIntakeResponse(result);
    expect(response.action).toBe('awaiting_perception');
    expect(response.runtimeState).toBe('awaiting_perception');
    expect(response.executionPath).toBe('awaiting_perception');
    expect(response.retryAfterMs).toBe(500);
    expect(result.streamId).toBeTruthy();

    vi.restoreAllMocks();
  });

  it('rejects classification when upload exists but hasAttachment flag is false', async () => {
    const ready = await runIntakeEvidenceBarrier({
      hasAttachment: true,
      imageRef: 'data:image/png;base64,abc',
      filename: 'flyer.png',
      mimeType: 'image/png',
      userMessage: '(Image attached)',
      sessionId: 'sess-assert-1',
      skipOcr: true,
      precomputedOcrText: GOLF_OCR,
    });
    expect(ready.status).toBe('ready');
    if (ready.status !== 'ready') return;

    expect(() =>
      assertClassificationEvidenceGate({
        hasAttachmentFlag: false,
        streamId: ready.bundle.streamId,
        evidenceView: ready.bundle.evidenceView,
      }),
    ).toThrow(IntakeEvidenceAssertionError);

    expect(() =>
      assertClassificationEvidenceGate({
        hasAttachmentFlag: true,
        streamId: ready.bundle.streamId,
        evidenceView: null,
      }),
    ).toThrow(/frozen EvidenceView/i);
  });

  it('never routes placeholder-only upload to general_chat when evidence exists', async () => {
    const ready = await runIntakeEvidenceBarrier({
      hasAttachment: true,
      imageRef: 'data:image/png;base64,abc',
      filename: 'golf-tour.png',
      mimeType: 'image/png',
      userMessage: '(Image attached)',
      sessionId: 'sess-guard-1',
      skipOcr: true,
      precomputedOcrText: GOLF_OCR,
      attachmentOnlyUpload: true,
    });
    expect(ready.status).toBe('ready');
    if (ready.status !== 'ready') return;

    const guarded = guardClassificationAgainstEvidence({
      classification: {
        tool: 'general_chat',
        executionPath: 'direct_action',
        confidence: 0.6,
        parameters: {},
      },
      userMessage: '(Image attached)',
      bundle: ready.bundle,
      attachmentOnlyUpload: true,
    });

    expect(guarded.tool).not.toBe('general_chat');
    expect(guarded.tool).toBe('ingest_asset_for_intent_detection');
    expect(guarded._classificationSource).toBe('evidence_barrier_placeholder_guard');
  });

  it('classifier input from placeholder never equals raw (Image attached) alone', async () => {
    const ready = await runIntakeEvidenceBarrier({
      hasAttachment: true,
      imageRef: 'data:image/png;base64,abc',
      filename: 'menu.jpg',
      mimeType: 'image/jpeg',
      userMessage: '(Image attached)',
      sessionId: 'sess-input-1',
      skipOcr: true,
      precomputedOcrText: 'Espresso $4 Latte $5',
    });
    expect(ready.status).toBe('ready');
    if (ready.status !== 'ready') return;

    const input = buildClassifierInputFromEvidence({
      userMessage: '(Image attached)',
      bundle: ready.bundle,
    });
    expect(input).not.toBe('(Image attached)');
    expect(isAttachmentOnlyPlaceholderMessage(input)).toBe(false);
  });
});
