import test from 'node:test';
import assert from 'node:assert/strict';
import { calibrateLoyaltyEvidenceConfidence } from '../loyaltyConfidenceCalibration.js';

test('reduces confidence when OCR row count disagrees with visual grid', () => {
  const summary = calibrateLoyaltyEvidenceConfidence({
    visualGridEvidence: { rows: 4, columns: 8, confidence: 0.92, repeatedRowPattern: true },
    semanticTextEvidence: { ocrRowEstimate: 5, confidence: 0.88 },
    cardTopology: { rows: 4, columns: 8, confidence: 0.95 },
  });
  assert.ok(summary.disagreements.includes('OCR row count differs from visual grid row count'));
  assert.ok(summary.overallConfidence < 1);
  assert.equal(summary.reviewRequired, true);
});

test('allows high confidence when signals agree', () => {
  const summary = calibrateLoyaltyEvidenceConfidence({
    visualGridEvidence: { rows: 4, columns: 8, confidence: 0.95, repeatedRowPattern: true },
    semanticTextEvidence: { ocrRowEstimate: 4, confidence: 0.9 },
    cardTopology: { rows: 4, columns: 8 },
  });
  assert.equal(summary.disagreements.length, 0);
  assert.ok(summary.overallConfidence > 0.85);
  assert.equal(summary.reviewRequired, false);
});
