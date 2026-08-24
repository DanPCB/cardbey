/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import { computeBusinessFidelityScore } from '../businessFidelityScore.js';

describe('computeBusinessFidelityScore — deferred images', () => {
  it('does not zero media when only gaps are no_image and catalog is evidence-backed', () => {
    const score = computeBusinessFidelityScore({
      evidence: {
        businessIdentity: { sourceConfidence: 0.9 },
        catalogEvidence: { confidence: 0.9 },
      },
      catalogDraft: {
        counts: { exact: 0, verified: 8, inferred: 0, fallback: 0, total: 8 },
        overallConfidence: 0.9,
        missingContent: ['no_image:A', 'no_image:B', 'no_image:C'],
      },
    });
    expect(score.media).toBe(80);
    expect(score.overall).toBeGreaterThanOrEqual(75);
    expect(score.exactCoverage).toBe(100);
  });

  it('still penalizes media when non-image gaps exist', () => {
    const score = computeBusinessFidelityScore({
      evidence: {
        businessIdentity: { sourceConfidence: 0.9 },
        catalogEvidence: { confidence: 0.9 },
      },
      catalogDraft: {
        counts: { exact: 0, verified: 2, inferred: 0, fallback: 0, total: 2 },
        overallConfidence: 0.9,
        missingContent: ['no_image:A', 'conflict:price'],
      },
    });
    expect(score.media).toBeLessThan(80);
  });
});
