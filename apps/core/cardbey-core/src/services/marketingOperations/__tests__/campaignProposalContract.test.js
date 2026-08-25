import { describe, expect, it } from 'vitest';
import { TARGET_TYPES } from '../constants.js';
import {
  PROPOSAL_KIND,
  attachReadiness,
  buildProposalFromOpportunity,
  evaluateProposalReadiness,
  intentFromOpportunity,
} from '../campaignProposalContract.js';

describe('campaignProposalContract', () => {
  it('maps investor opportunities away from public destinations', () => {
    expect(intentFromOpportunity({ targetType: TARGET_TYPES.INVESTOR_DISCOVERY })).toBe('HUMAN_FOLLOWUP');
    expect(intentFromOpportunity({ opportunityType: 'MARKET_ENTRY' })).toBe('MARKET_ENTRY');
  });

  it('builds provenance Objective → Task → Evidence → Opportunity', () => {
    const proposal = buildProposalFromOpportunity({
      id: 'opp1',
      objectiveId: 'obj1',
      taskId: 'task1',
      targetType: TARGET_TYPES.USER_ACQUISITION,
      opportunityType: 'MARKET_ENTRY',
      title: 'Vietnam market entry',
      summary: 'Public DFAT context.',
      audience: 'Vietnamese SME owners',
      market: 'vn',
      rationale: 'Catalog facts support an education angle.',
      suggestedAngle: 'Cardbey as an AI business-creation platform under development',
      suggestedChannel: 'facebook',
      evidence: [
        {
          id: 'ev1',
          kind: 'SOURCE_FACT',
          sourceUrl: 'https://www.dfat.gov.au/',
          sourceTitle: 'DFAT',
        },
        { id: 'ev2', kind: 'AI_INTERPRETATION', sourceUrl: null, sourceTitle: 'Analysis — not a source fact' },
      ],
      objective: { id: 'obj1', name: 'Vietnamese SMEs → Cardbey', language: 'vi' },
      task: { id: 'task1', language: 'vi' },
    }, { campaignId: 'camp1', actorId: 'editor' });

    expect(proposal.kind).toBe(PROPOSAL_KIND);
    expect(proposal.provenance).toMatchObject({
      objectiveId: 'obj1',
      researchTaskId: 'task1',
      opportunityId: 'opp1',
      campaignId: 'camp1',
    });
    expect(proposal.provenance.sourceFactIds).toEqual(['ev1']);
    expect(proposal.sourceEvidence).toHaveLength(1);
    expect(proposal.ctaLabel).toMatch(/business/i);
    expect(proposal.destination.available).toBe(true);
    expect(proposal.purpose).toBe('USER_ACQUISITION');
    expect(proposal.liveMeta).toBe(false);
    const readiness = evaluateProposalReadiness(proposal);
    expect(readiness.livePublishReady).toBe(false);
    expect(readiness.channelExecutionReady).toBe(false);
    expect(readiness.evidenceLinked).toBe(true);
    expect(attachReadiness(proposal).readinessState.humanApproved).toBe(false);
  });

  it('classifies investor proposals as INVESTOR with no public CTA or live publish', () => {
    const proposal = buildProposalFromOpportunity({
      id: 'opp_inv',
      objectiveId: 'obj_inv',
      taskId: 'task_inv',
      targetType: TARGET_TYPES.INVESTOR_DISCOVERY,
      opportunityType: 'INVESTOR_THEME',
      title: 'Australia inbound-investment theme',
      summary: 'Public Austrade context.',
      audience: 'Research: investment themes',
      market: 'au',
      rationale: 'Catalog facts support a research-only investor theme.',
      suggestedAngle: 'Cardbey as an under-development AI business platform',
      evidence: [
        { id: 'ev_inv', kind: 'SOURCE_FACT', sourceUrl: 'https://www.austrade.gov.au/', sourceTitle: 'Austrade' },
        { id: 'ev_ai', kind: 'AI_INTERPRETATION', sourceUrl: null, sourceTitle: 'Analysis — not a source fact' },
      ],
      objective: { id: 'obj_inv', name: 'Investor themes', language: 'en' },
      task: { id: 'task_inv', language: 'en' },
    }, { campaignId: 'camp_inv' });

    expect(proposal.purpose).toBe('INVESTOR');
    expect(proposal.ctaLabel).toBeNull();
    expect(proposal.destination.available).toBe(false);
    expect(proposal.successMetricHypothesis.primary).toBe('INVESTOR_HANDOFF');
    expect(proposal.liveMeta).toBe(false);
    expect(evaluateProposalReadiness(proposal).livePublishReady).toBe(false);
    expect(proposal.sourceEvidence).toHaveLength(1);
    expect(proposal.sourceEvidence[0].kind).toBe('SOURCE_FACT');
  });
});
