import { describe, expect, it } from 'vitest';
import { EVIDENCE_KIND } from '../researchContract.js';
import { FACT_STATUS } from '../canonicalInvestorFacts.js';
import {
  INVESTOR_PROVENANCE_CHAIN,
  buildCanonicalLandingProjection,
  buildInvestorEngagementProfile,
  buildLandingProjection,
  buildOutreachPack,
  evaluateInvestorReadiness,
  hashInvestorToken,
} from '../investorEngagementContract.js';
import { CANONICAL_EVENTS } from '../constants.js';

describe('investorEngagementContract', () => {
  it('keeps SOURCE_FACT and AI_INTERPRETATION on separate profile refs', () => {
    const profile = buildInvestorEngagementProfile({
      campaignId: 'camp1',
      opportunity: {
        id: 'opp1',
        title: 'Australia inbound-investment theme',
        targetType: 'INVESTOR_DISCOVERY',
        confidence: 0.6,
        market: 'au',
        evidence: [
          { id: 'ev1', kind: EVIDENCE_KIND.SOURCE_FACT, sourceTitle: 'Austrade', sourceUrl: 'https://www.austrade.gov.au/' },
          { id: 'ev2', kind: EVIDENCE_KIND.AI_INTERPRETATION, sourceTitle: 'Analysis — not a source fact' },
        ],
      },
      proposal: {
        purpose: 'INVESTOR',
        targetType: 'INVESTOR_DISCOVERY',
        opportunityId: 'opp1',
        objectiveId: 'obj1',
        researchTaskId: 'task1',
        provenance: { objectiveId: 'obj1', researchTaskId: 'task1', opportunityId: 'opp1', campaignId: 'camp1' },
      },
    });

    expect(profile.evidenceRefs).toEqual([
      expect.objectContaining({ id: 'ev1', kind: EVIDENCE_KIND.SOURCE_FACT }),
    ]);
    expect(profile.interpretationRefs).toEqual([
      expect.objectContaining({ id: 'ev2', kind: EVIDENCE_KIND.AI_INTERPRETATION }),
    ]);
    expect(profile.fitRationaleKind).toBe(EVIDENCE_KIND.AI_INTERPRETATION);
    expect(profile.provenance.chain).toEqual([...INVESTOR_PROVENANCE_CHAIN]);
    expect(profile.readinessState.livePublishReady).toBe(false);
    expect(profile.readinessState.outreachSendable).toBe(false);
  });

  it('omits restricted and missing canonical facts from landing projections', () => {
    const projection = buildCanonicalLandingProjection();
    const keys = projection.sections.map((s) => s.key);
    expect(keys).not.toContain('raise_terms');
    expect(keys).not.toContain('financials');
    expect(keys).not.toContain('traction_metrics');
    expect(keys).not.toContain('market_size');
    expect(projection.restrictedOmitted).toEqual(
      expect.arrayContaining(['raise_terms', 'financials', 'traction_metrics']),
    );
    expect(projection.inventsFacts).toBe(false);
    expect(projection.sections.every((s) => s.status !== FACT_STATUS.RESTRICTED)).toBe(true);
    expect(projection.sections.every((s) => s.status !== FACT_STATUS.MISSING)).toBe(true);
  });

  it('does not let an investor profile change canonical fact bodies', () => {
    const canonical = buildCanonicalLandingProjection();
    const profiled = buildLandingProjection({
      investorName: 'Example fund (research theme)',
      emphasize: ['wedge_au_vn', 'positioning_accelerator'],
      likelyQuestions: ['Why Vietnam?'],
    });
    const byKey = Object.fromEntries(canonical.sections.map((s) => [s.key, s.body]));
    for (const section of profiled.sections) {
      if (byKey[section.key]) expect(section.body).toBe(byKey[section.key]);
    }
  });

  it('watermarks outreach packs as draft-only', () => {
    const pack = buildOutreachPack({ investorName: 'Theme', primaryAngle: 'Under development' }, {});
    expect(pack.watermark).toMatch(/FOUNDER APPROVAL REQUIRED/);
    expect(pack.outreachDraft).toMatch(/DRAFT — FOUNDER APPROVAL REQUIRED/);
    expect(pack.sends).toBe(false);
    expect(pack.liveMeta).toBe(false);
  });

  it('blocks investor Meta and public CTAs in readiness', () => {
    const readiness = evaluateInvestorReadiness({
      proposal: {
        purpose: 'INVESTOR',
        targetType: 'INVESTOR_DISCOVERY',
        liveMeta: true,
        destination: { available: true },
      },
      profile: { evidenceRefs: [{ id: 'ev1' }] },
      pack: { kind: 'INVESTOR_OUTREACH_PACK_V1' },
    });
    expect(readiness.livePublishReady).toBe(false);
    expect(readiness.canSend).toBe(false);
    expect(readiness.blockers).toEqual(
      expect.arrayContaining(['investor_meta_forbidden', 'investor_public_cta_forbidden']),
    );
  });

  it('does not alias INVESTOR_HANDOFF to CARDBEY_HANDOFF', () => {
    expect(CANONICAL_EVENTS.INVESTOR_HANDOFF).toBe('INVESTOR_HANDOFF');
    expect(CANONICAL_EVENTS.CARDBEY_HANDOFF).toBe('CARDBEY_HANDOFF');
    expect(CANONICAL_EVENTS.INVESTOR_HANDOFF).not.toBe(CANONICAL_EVENTS.CARDBEY_HANDOFF);
    expect(hashInvestorToken('abc')).toHaveLength(64);
    expect(hashInvestorToken('abc')).toBe(hashInvestorToken('abc'));
  });
});
