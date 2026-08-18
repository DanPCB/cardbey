import { describe, expect, it } from 'vitest';
import { buildIntakeEvidenceSnapshot } from '../evidenceSnapshot.js';
import { buildObserveFirstUploadAskPayload } from '../../../performerTurnBelief/buildObserveFirstUploadAsk.js';

function ocrEvent(text, eventId) {
  return {
    eventId,
    streamId: 'reality:session:test',
    kind: 'ocr_output',
    recordedAt: new Date().toISOString(),
    observations: [
      {
        kind: 'ocr_text',
        payload: { text, status: 'ok', provider: 'test' },
      },
    ],
  };
}

describe('buildIntakeEvidenceSnapshot — multi-upload session hardening', () => {
  it('uses the latest ocr_output in a multi-upload session stream', () => {
    const snapshot = buildIntakeEvidenceSnapshot(
      [
        ocrEvent('CA HANDYMAN SERVICES', 'e1'),
        ocrEvent('NOODLE hut\n136 Station Street', 'e2'),
        ocrEvent('ANISON CAPITAL GROUP', 'e3'),
      ],
      { interpretations: [] },
    );

    expect(snapshot.ocrText).toMatch(/ANISON CAPITAL GROUP/i);
    expect(snapshot.ocrText).not.toMatch(/HANDYMAN/i);
  });

  it('Handyman → Mộc → NOODLE hut: Ask identity follows latest stream OCR only', () => {
    const snapshot = buildIntakeEvidenceSnapshot(
      [
        ocrEvent('CA HANDYMAN SERVICES', 'e1'),
        ocrEvent('Mộc\nVIETNAMESE RESTAURANT', 'e2'),
        ocrEvent('NOODLE\nhut\n136 Station Street', 'e3'),
      ],
      { interpretations: [] },
    );

    const ask = buildObserveFirstUploadAskPayload({
      stickyGoalName: 'CA HANDYMAN SERVICES',
      ocrText: snapshot.ocrText,
      attachmentAnalysis: { ocrText: snapshot.ocrText },
    });

    expect(ask.response).toMatch(/NOODLE/i);
    expect(ask.response).not.toMatch(/HANDYMAN/i);
    expect(ask.response).not.toMatch(/Mộc|Moc/i);
    expect(ask.options?.some((o) => /Create store for NOODLE/i.test(o.label))).toBe(true);
  });

  it('single upload still returns that OCR', () => {
    const snapshot = buildIntakeEvidenceSnapshot(
      [ocrEvent('CA HANDYMAN SERVICES', 'e1')],
      { interpretations: [] },
    );
    expect(snapshot.ocrText).toBe('CA HANDYMAN SERVICES');
  });
});
