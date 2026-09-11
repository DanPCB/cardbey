/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import { CONFIDENCE } from '../types.js';
import {
  hasStrongIdentityEvidence,
  isVerifiedResearchMatch,
  buildResearchQualityCheckpointPrompt,
  reportExtractedResearchFields,
} from '../pathAResearchQuality.js';

describe('pathAResearchQuality', () => {
  it('requires USE + strong identity for verified match', () => {
    expect(
      isVerifiedResearchMatch({
        confidence: CONFIDENCE.USE,
        reasons: ['google-place-name'],
      }),
    ).toBe(false);
    expect(
      isVerifiedResearchMatch({
        confidence: CONFIDENCE.USE,
        reasons: ['name-exact', 'phone'],
      }),
    ).toBe(true);
    expect(
      isVerifiedResearchMatch({
        confidence: 0.5,
        reasons: ['phone', 'website'],
      }),
    ).toBe(false);
  });

  it('hasStrongIdentityEvidence recognizes phone/website/name-exact', () => {
    expect(hasStrongIdentityEvidence(['phone'])).toBe(true);
    expect(hasStrongIdentityEvidence(['google-place-name'])).toBe(false);
  });

  it('buildResearchQualityCheckpointPrompt leaves generative unchanged', () => {
    const base = 'Your store draft is ready. You can personalise it now by adding your branding.';
    expect(
      buildResearchQualityCheckpointPrompt({
        mode: 'generative',
        basePrompt: base,
        businessName: 'X',
      }),
    ).toBe(base);
  });

  it('buildResearchQualityCheckpointPrompt for research match', () => {
    const text = buildResearchQualityCheckpointPrompt({
      mode: 'research',
      businessName: 'CC Cafe',
      address: '1 Main St',
      itemCount: 12,
      catalogSource: 'scraped',
    });
    expect(text).toContain('We found CC Cafe at 1 Main St');
    expect(text).toContain('sourced from your website');
  });

  it('buildResearchQualityCheckpointPrompt for low-confidence fallback', () => {
    const text = buildResearchQualityCheckpointPrompt({
      mode: 'research',
      businessName: 'CC Cafe',
      lowConfidenceFallback: true,
    });
    expect(text).toContain("couldn't find an exact match");
    expect(text).toContain('suggested content');
  });

  it('reportExtractedResearchFields lists missing', () => {
    const report = reportExtractedResearchFields({
      businessName: { value: 'CC Cafe' },
      phone: { value: '039999' },
    });
    expect(report.fieldsExtracted).toEqual(expect.arrayContaining(['businessName', 'phone']));
    expect(report.fieldsMissing).toEqual(expect.arrayContaining(['website', 'address']));
  });
});
