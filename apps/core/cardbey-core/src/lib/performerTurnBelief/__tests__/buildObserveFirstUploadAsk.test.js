import { describe, expect, it } from 'vitest';
import {
  buildObserveFirstUploadAskPayload,
  buildObserveFirstQuestion,
  extractOcrTextFromAttachmentAnalysis,
} from '../buildObserveFirstUploadAsk.js';
import { PERFORMER_STATUS, hasHardConflict } from '../index.js';

describe('Observe-first upload Ask', () => {
  it('extracts OCR text from attachmentAnalysis', () => {
    expect(
      extractOcrTextFromAttachmentAnalysis({
        ocrText: 'ANISON CAPITAL GROUP\nMelbourne',
      }),
    ).toMatch(/ANISON/i);
  });

  it('states observed identity and offers Create store for that name (no draft form)', () => {
    const payload = buildObserveFirstUploadAskPayload({
      ocrText: 'ANISON CAPITAL GROUP\nFinance\nMelbourne',
      attachmentAnalysis: {
        artifactType: 'logo',
        ocrText: 'ANISON CAPITAL GROUP\nFinance\nMelbourne',
        confidence: 0.8,
      },
      goal: '(Image attached)',
    });

    expect(payload.action).toBe('clarify');
    expect(payload.clarifyType).toBe('observe_first_upload');
    expect(payload.storeCreationDraft).toBeNull();
    expect(payload.response).toMatch(/ANISON/i);
    expect(payload.turnBelief?.identity?.name).toMatch(/ANISON/i);
    expect(payload.performerStatus).toBe(PERFORMER_STATUS.READY_TO_PROPOSE);
    expect(payload.options?.some((o) => /Create store for ANISON/i.test(o.label))).toBe(true);
    expect(payload.options?.some((o) => /Something else/i.test(o.label))).toBe(true);
  });

  it('ignores sticky goal name — upload Ask is this-turn OCR only', () => {
    const payload = buildObserveFirstUploadAskPayload({
      stickyGoalName: 'PTH Construction',
      ocrText: 'SWEET ESCAPE SPA\nMassage',
      attachmentAnalysis: { ocrText: 'SWEET ESCAPE SPA\nMassage' },
    });

    expect(hasHardConflict(payload.turnBelief)).toBe(false);
    expect(payload.turnBelief?.identity?.name).toMatch(/SWEET ESCAPE SPA/i);
    expect(payload.response).toMatch(/SWEET ESCAPE SPA/i);
    expect(payload.response).not.toMatch(/PTH/i);
    expect(payload.performerStatus).toBe(PERFORMER_STATUS.READY_TO_PROPOSE);
  });

  it('asks intent when OCR has no business name (still no form)', () => {
    const payload = buildObserveFirstUploadAskPayload({
      ocrText: '',
      attachmentAnalysis: { artifactType: 'logo', confidence: 0.2 },
      goal: '(Image attached)',
    });

    expect(payload.storeCreationDraft).toBeNull();
    expect(payload.response).toMatch(/business name|received your upload|could not yet read/i);
    expect(payload.options?.some((o) => /Create a store|ask for details/i.test(o.label))).toBe(true);
  });
});
