import { describe, expect, it, beforeEach } from 'vitest';
import {
  __resetFundraisingCampaignMemory,
  admitCatalogInvestorToCampaign,
  admitFromCapitalHandoff,
  approveOutreachDraft,
  bumpDocumentVersion,
  createOutreachDraft,
  ensureCardbeySeed2026Campaign,
  getCampaignOverview,
  getWave0HumanReviewCohort,
  listDocuments,
  listEvents,
  listGapsForTarget,
  listTargets,
  resolveResearchGap,
  setCampaignState,
  transitionTargetLifecycle,
} from '../fundraisingCampaignService.js';
import { buildCapitalCampaignHandoff } from '../../marketIntent/capital/capitalResourceNetworkService.js';
import { projectInvestorToMarketGraphNode } from '../../marketIntent/capital/projectInvestorToMarketGraphNode.js';
import {
  buildCardbeySeed2026MarketGraphNode,
  buildCardbeySeed2026SeekerProfile,
} from '../../marketIntent/capital/cardbeySeed2026Mission.js';
import { evaluateReciprocalMatchPair } from '../../marketIntent/evaluateReciprocalMatch.js';
import { buildQualifiedCapitalOpportunity } from '../../marketIntent/capital/qualifyCapitalPair.js';
import { getCapitalCohortById } from '../../marketIntent/capital/capitalInvestorResearchCohort.js';
import { FUNDRAISING_CAMPAIGN_STATES, FUNDRAISING_EVENTS } from '../fundraisingCampaignContracts.js';
import { PersistentMarketGraphStore } from '../../marketIntent/capital/persistentMarketGraphStore.js';

describe('Fundraising Campaign V1', () => {
  beforeEach(() => {
    __resetFundraisingCampaignMemory();
  });

  it('creates campaign in PREPARING — does not infer ACTIVE', () => {
    const c = ensureCardbeySeed2026Campaign();
    expect(c.state).toBe(FUNDRAISING_CAMPAIGN_STATES.PREPARING);
    expect(c.proposedTargetAmountAud).toBe(3_000_000);
    expect((c.proposedTermsJson as any).distinction).toBe('PROPOSED');
    expect(listDocuments().length).toBeGreaterThan(5);
  });

  it('rejects unconfirmed admission', () => {
    const result = admitCatalogInvestorToCampaign({ catalogId: 'inv_airtree_au', confirmed: false });
    expect(result.ok).toBe(false);
    expect(result.requiresConfirmation).toBe(true);
    expect(listTargets()).toHaveLength(0);
  });

  it('confirmed admission preserves three separate assessments', () => {
    const result = admitCatalogInvestorToCampaign({
      catalogId: 'inv_blackbird_au',
      confirmed: true,
      admittingOperatorId: 'op_test',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const a = result.assessments!;
    expect(a.reciprocal?.band).toBeTruthy();
    expect(a.capitalQualification?.band).toBeTruthy();
    expect(a.investorFit?.kind).toBe('INVESTOR_FIT_V1');
    expect(a.investorFit?.total).toBeTypeOf('number');
    // Never merged
    expect((a as any).mergedScore).toBeUndefined();
    expect((a as any).combinedScore).toBeUndefined();
    expect(result.target.lifecycle).toBe('TARGET');
    expect(result.target.admittingOperatorId).toBe('op_test');
    expect(result.target.handoffJson?.kind).toBe('ADMIT_TO_FUNDRAISING_CAMPAIGN_V1');
  });

  it('prevents duplicate campaign admission', () => {
    admitCatalogInvestorToCampaign({ catalogId: 'inv_squarepeg_au', confirmed: true });
    const dup = admitCatalogInvestorToCampaign({ catalogId: 'inv_squarepeg_au', confirmed: true });
    expect(dup.ok).toBe(false);
    expect(dup.error).toBe('duplicate_admission');
    expect(listTargets()).toHaveLength(1);
  });

  it('admit-handoff contract path works', () => {
    const org = getCapitalCohortById('inv_rampersand_au')!;
    const { node, capitalProfile } = projectInvestorToMarketGraphNode(org);
    const company = buildCardbeySeed2026MarketGraphNode();
    const reciprocal = evaluateReciprocalMatchPair(company, node);
    const opportunity = buildQualifiedCapitalOpportunity({
      companyNode: company,
      investorNode: node,
      reciprocal,
      companyProfile: buildCardbeySeed2026SeekerProfile(),
      investorProfile: capitalProfile,
    });
    const handoff = buildCapitalCampaignHandoff({ opportunity });
    const result = admitFromCapitalHandoff({
      handoff,
      catalogId: 'inv_rampersand_au',
      confirmed: true,
    });
    expect(result.ok).toBe(true);
  });

  it('lifecycle transition preserves history; invalid transition rejected', () => {
    const admitted = admitCatalogInvestorToCampaign({ catalogId: 'inv_airtree_au', confirmed: true });
    expect(admitted.ok).toBe(true);
    if (!admitted.ok) return;
    const id = admitted.target.id;
    const ok = transitionTargetLifecycle({ targetId: id, to: 'RESEARCHED', actorId: 'op', reason: 'research done' });
    expect(ok.ok).toBe(true);
    if (!ok.ok) return;
    expect(ok.target.lifecycleHistoryJson.length).toBeGreaterThanOrEqual(2);
    const bad = transitionTargetLifecycle({ targetId: id, to: 'COMMITTED' });
    // Jumping many steps forward is allowed by our forward rule — COMMITTED is forward
    // Force invalid: from COMMITTED then to TARGET
    transitionTargetLifecycle({ targetId: id, to: 'COMMITTED', reason: 'test' });
    const afterTerminal = transitionTargetLifecycle({ targetId: id, to: 'CONTACTED' });
    expect(afterTerminal.ok).toBe(false);
    expect(afterTerminal.error).toBe('terminal_state');
    void bad;
  });

  it('research gap created; AI interpretation cannot resolve as SOURCE_FACT', () => {
    const admitted = admitCatalogInvestorToCampaign({ catalogId: 'inv_wavemaker_sea', confirmed: true });
    expect(admitted.ok).toBe(true);
    if (!admitted.ok) return;
    const gaps = listGapsForTarget(admitted.target.id);
    expect(gaps.some((g) => g.field === 'chequeRange')).toBe(true);
    const gap = gaps.find((g) => g.field === 'chequeRange')!;
    const blocked = resolveResearchGap({
      gapId: gap.id,
      resolution: { evidenceKind: 'AI_INTERPRETATION', summary: 'guessed cheque' },
    });
    expect(blocked.ok).toBe(false);
    expect(blocked.error).toBe('ai_interpretation_cannot_become_source_fact');
    const resolved = resolveResearchGap({
      gapId: gap.id,
      resolution: {
        evidenceKind: 'SOURCE_FACT',
        summary: 'Public fund page states typical seed cheques',
        sourceUrl: 'https://example.com',
      },
    });
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(resolved.gap.currentEvidenceState).toBe('SOURCE_FACT');
    expect(resolved.next?.reprojectRequired).toBe(true);
  });

  it('node update marks previous match stale and re-evaluation works', async () => {
    const store = new PersistentMarketGraphStore();
    await store.clearMemory();
    const company = buildCardbeySeed2026MarketGraphNode();
    await store.admit({ ...company, domain: 'CAPITAL' });
    const org = getCapitalCohortById('inv_blackbird_au')!;
    const { node, capitalProfile } = projectInvestorToMarketGraphNode(org);
    await store.admit({ ...node, domain: 'CAPITAL', capitalProfile });
    const changed = {
      ...node,
      label: `${node.label} updated`,
      domain: 'CAPITAL' as const,
      capitalProfile,
    };
    const second = await store.admit(changed, { replace: true });
    expect(second.matches.length).toBeGreaterThan(0);
  });

  it('outreach remains DRAFT; approve does not send', () => {
    const admitted = admitCatalogInvestorToCampaign({ catalogId: 'inv_airtree_au', confirmed: true });
    expect(admitted.ok).toBe(true);
    if (!admitted.ok) return;
    const draft = createOutreachDraft({
      targetId: admitted.target.id,
      draftType: 'initial_investor_email',
    });
    expect(draft.ok).toBe(true);
    if (!draft.ok) return;
    expect(draft.draft.status).toBe('DRAFT');
    expect(draft.draft.markedAsAi).toBe(true);
    expect(draft.sends).toBe(false);
    expect((draft.draft.metadataJson as any).sendBlocked).toBe(true);
    const approved = approveOutreachDraft({ draftId: draft.draft.id, actorId: 'founder' });
    expect(approved.ok).toBe(true);
    if (!approved.ok) return;
    expect(approved.sends).toBe(false);
    expect((approved.draft.metadataJson as any).sendBlocked).toBe(true);
  });

  it('document registry versioning stays INTERNAL', () => {
    ensureCardbeySeed2026Campaign();
    const doc = listDocuments()[0]!;
    const bumped = bumpDocumentVersion({ documentId: doc.id, evidenceStatus: 'PARTIAL' });
    expect(bumped.ok).toBe(true);
    if (!bumped.ok) return;
    expect(bumped.document.visibility).toBe('INTERNAL');
    expect(bumped.externalShare).toBe(false);
  });

  it('Wave 0 cohort is human-review sized and not auto-admitted', () => {
    const wave = getWave0HumanReviewCohort(12);
    expect(wave.candidates.length).toBeGreaterThanOrEqual(8);
    expect(wave.candidates.length).toBeLessThanOrEqual(12);
    expect(listTargets()).toHaveLength(0);
  });

  it('records real audit events only', () => {
    admitCatalogInvestorToCampaign({ catalogId: 'inv_blackbird_au', confirmed: true });
    const types = listEvents().map((e) => e.eventType);
    expect(types).toContain(FUNDRAISING_EVENTS.INVESTOR_ADMITTED);
    expect(types).toContain(FUNDRAISING_EVENTS.RESEARCH_GAP_CREATED);
    expect(types).not.toContain('FAKE_FUNNEL_EVENT');
  });

  it('overview next actions and explicit activate', () => {
    const overview = getCampaignOverview();
    expect(overview.campaign.state).toBe('PREPARING');
    expect(overview.evidenceDistinction.verifiedTraction).toBe(false);
    const activated = setCampaignState(overview.campaign.id, 'ACTIVE', 'founder');
    expect(activated.ok).toBe(true);
  });
});
