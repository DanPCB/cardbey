/**
 * Reality-stream OCR must use the latest upload event (not the first).
 */
import { describe, expect, it } from 'vitest';
import { buildIntakeEvidenceSnapshot } from '../evidenceSnapshot.js';

describe('buildIntakeEvidenceSnapshot', () => {
  it('uses latest ocr_output when the session stream has multiple uploads', () => {
    const events = [
      {
        kind: 'ocr_output',
        observations: [{ kind: 'ocr_text', payload: { text: 'PTH INTERNATIONAL FURNITURE', status: 'ok' } }],
      },
      {
        kind: 'ocr_output',
        observations: [{ kind: 'ocr_text', payload: { text: 'CELLARBRATIONS DEER PARK', status: 'ok' } }],
      },
    ];
    const snap = buildIntakeEvidenceSnapshot(events, { interpretations: [] });
    expect(snap.ocrText).toBe('CELLARBRATIONS DEER PARK');
  });
});
