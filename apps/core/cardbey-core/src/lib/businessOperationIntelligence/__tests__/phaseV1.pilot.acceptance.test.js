/**
 * V1 Pilot productization — preview builder + event constants acceptance.
 */

import { describe, expect, it, afterEach } from 'vitest';
import {
  buildFullAnalysisPreview,
  BUSINESS_OPERATION_EVENTS,
  BUSINESS_OPERATION_PUBLIC_CLIENT_EVENTS,
  isBusinessOperationPilotV1Enabled,
} from '../index.js';
import { CANONICAL_EVENTS as MO_EVENTS } from '../../../services/marketingOperations/constants.js';

describe('V1 pilot full analysis preview', () => {
  it('builds preview from real report counts without fabricating', () => {
    const report = {
      reportId: 'r1',
      mode: 'EXISTING',
      findings: [
        { id: 'f1', title: 'Offerings', detail: 'Cardbey identified 17 products across your website.' },
        { id: 'f2', title: 'Gaps', detail: 'Specification structure varies between products.' },
        { id: 'f3', title: 'Digital', detail: 'Website verified.' },
      ],
      recommendations: [
        {
          id: 'rec1',
          title: 'Normalize specs',
          businessSpecificObservation:
            'Cardbey identified 17 products across your website, but specification structure varies significantly between products.',
          whyItMatters: 'Inconsistent specs make comparison and merchandising harder.',
          specificity: 'BUSINESS_SPECIFIC',
          priority: 'HIGH',
          knowledgeState: 'DISCOVERED_FACT',
        },
        {
          id: 'rec2',
          recommendedAction: 'Clarify top SKUs',
          specificity: 'EVIDENCE_SPECIFIC',
          priority: 'MEDIUM',
        },
      ],
      priorityActions: [{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }],
      competitorCandidates: [{ id: 'c1', name: 'Nearby Co' }],
      plan: {
        day30: [{ id: 'a' }],
        day60: [{ id: 'b' }],
        day90: [{ id: 'c' }],
      },
      marketContext: { statement: 'Found comparisons.' },
    };

    const preview = buildFullAnalysisPreview(report);
    expect(preview.ok).toBe(true);
    expect(preview.counts.findings).toBe(3);
    expect(preview.counts.priorityActions).toBe(3);
    expect(preview.counts.comparisons).toBe(1);
    expect(preview.counts.hasPlan).toBe(true);
    expect(preview.sampleFinding?.observation).toMatch(/17 products/);
    expect(preview.highlights?.length).toBeGreaterThan(0);
  });

  it('does not invent comparison coverage when empty', () => {
    const preview = buildFullAnalysisPreview({
      reportId: 'r2',
      findings: [{ id: 'f', title: 'X', detail: 'Enough detail for a finding here.' }],
      recommendations: [],
      competitorCandidates: [],
      plan: { day30: [], day60: [], day90: [] },
    });
    expect(preview.counts.comparisons).toBe(0);
    expect(preview.limitations?.some((l) => /comparison/i.test(l))).toBe(true);
  });

  it('rejects missing report', () => {
    expect(buildFullAnalysisPreview(null).ok).toBe(false);
  });
});

describe('V1 pilot events + flags', () => {
  const prev = process.env.ENABLE_BUSINESS_OPERATION_PILOT_V1;
  afterEach(() => {
    if (prev === undefined) delete process.env.ENABLE_BUSINESS_OPERATION_PILOT_V1;
    else process.env.ENABLE_BUSINESS_OPERATION_PILOT_V1 = prev;
  });

  it('exposes funnel events on canonical spine', () => {
    expect(MO_EVENTS.BUSINESS_OPERATION_LANDING_VIEWED).toBe('BUSINESS_OPERATION_LANDING_VIEWED');
    expect(MO_EVENTS.BUSINESS_FULL_ANALYSIS_PREVIEW_VIEWED).toBe(
      'BUSINESS_FULL_ANALYSIS_PREVIEW_VIEWED',
    );
    expect(MO_EVENTS.BUSINESS_FULL_ANALYSIS_UNLOCK_CLICKED).toBe(
      'BUSINESS_FULL_ANALYSIS_UNLOCK_CLICKED',
    );
    expect(MO_EVENTS.BUSINESS_FULL_ANALYSIS_PILOT_INTEREST).toBe(
      'BUSINESS_FULL_ANALYSIS_PILOT_INTEREST',
    );
    expect(BUSINESS_OPERATION_EVENTS.LANDING_VIEWED).toBe(
      MO_EVENTS.BUSINESS_OPERATION_LANDING_VIEWED,
    );
    expect(BUSINESS_OPERATION_PUBLIC_CLIENT_EVENTS).toContain(
      BUSINESS_OPERATION_EVENTS.FULL_ANALYSIS_UNLOCK_CLICKED,
    );
  });

  it('pilot flag defaults off', () => {
    delete process.env.ENABLE_BUSINESS_OPERATION_PILOT_V1;
    expect(isBusinessOperationPilotV1Enabled()).toBe(false);
    process.env.ENABLE_BUSINESS_OPERATION_PILOT_V1 = 'true';
    expect(isBusinessOperationPilotV1Enabled()).toBe(true);
  });
});
