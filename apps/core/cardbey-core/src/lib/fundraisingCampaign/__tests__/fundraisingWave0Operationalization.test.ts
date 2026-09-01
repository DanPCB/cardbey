import { describe, expect, it, beforeEach } from 'vitest';
import {
  __resetFundraisingCampaignMemory,
  admitCatalogInvestorToCampaign,
  createOutreachDraft,
  ensureCardbeySeed2026Campaign,
  getCampaignOverview,
  listDocuments,
  listEvents,
  listGapsForTarget,
  listTargets,
  recordInvestorQuestion,
  resolveResearchGap,
} from '../fundraisingCampaignService.js';
import {
  buildWave0ReviewTable,
  resolveResearchGapAndReevaluate,
  runWave0InternalRehearsal,
} from '../wave0Operationalization.js';
import { classifySuitcaseArtifact, seedInvestorQuestionBank } from '../campaignPrepContent.js';
import { FUNDRAISING_EVENTS } from '../fundraisingCampaignContracts.js';
import { buildCardbeySeed2026MarketGraphNode } from '../../marketIntent/capital/cardbeySeed2026Mission.js';

describe('Fundraising Wave 0 operationalization', () => {
  beforeEach(() => {
    __resetFundraisingCampaignMemory();
  });

  it('mission bootstrap is idempotent and PREPARING', () => {
    const a = ensureCardbeySeed2026Campaign();
    const b = ensureCardbeySeed2026Campaign();
    expect(a.id).toBe(b.id);
    expect(a.state).toBe('PREPARING');
    expect(a.proposedTargetAmountAud).toBe(3_000_000);
  });

  it('Cardbey demand node is evidence-backed without invented traction', () => {
    const node = buildCardbeySeed2026MarketGraphNode();
    expect(node.wants.some((w) => /A\$3M|seed capital/i.test(w.label))).toBe(true);
    expect(node.has.some((h) => /Resource Aggregation|marketplace|capability/i.test(h.label))).toBe(true);
    const blob = JSON.stringify(node);
    expect(blob).not.toMatch(/GMV|CAC|LTV|valuation|revenue \$|active users/i);
  });

  it('suitcase placeholder is never READY', () => {
    ensureCardbeySeed2026Campaign();
    const docs = listDocuments();
    expect(docs.length).toBeGreaterThan(0);
    for (const d of docs) {
      const c = classifySuitcaseArtifact(d);
      expect(c.readiness).not.toBe('READY');
      expect(d.contentRef).toBeNull();
    }
    const overview = getCampaignOverview();
    expect(overview.documentReadiness.ready).toBe(0);
    expect(overview.documentReadiness.note).toMatch(/placeholder/i);
  });

  it('investor questions never fabricate ANSWERED without content', () => {
    const bank = seedInvestorQuestionBank();
    expect(bank.every((q) => q.answerState !== 'ANSWERED')).toBe(true);
    const blocked = recordInvestorQuestion({
      category: 'TRACTION',
      question: 'What is ARR?',
      answerState: 'ANSWERED',
    });
    expect(blocked.ok).toBe(false);
  });

  it('UNKNOWN remains UNKNOWN when keepUnknownCheque on re-eval', async () => {
    const admitted = admitCatalogInvestorToCampaign({ catalogId: 'inv_airtree_au', confirmed: true });
    expect(admitted.ok).toBe(true);
    if (!admitted.ok) return;
    const gap = listGapsForTarget(admitted.target.id).find((g) => g.field === 'chequeRange');
    expect(gap).toBeTruthy();
    const result = await resolveResearchGapAndReevaluate({
      gapId: gap!.id,
      resolution: {
        evidenceKind: 'SOURCE_FACT',
        summary: 'Public site does not disclose precise cheque band',
        sourceUrl: 'https://www.airtree.vc/',
        fieldUpdates: { keepUnknownCheque: true, chequeMinAud: null, chequeMaxAud: null },
      },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.reevaluation.ok).toBe(true);
    if (!result.reevaluation.ok) return;
    expect(result.reevaluation.capitalProfile.unknownFields).toEqual(
      expect.arrayContaining(['cheque_min', 'cheque_max']),
    );
  });

  it('AI_INTERPRETATION cannot close research gap as SOURCE_FACT', () => {
    const admitted = admitCatalogInvestorToCampaign({ catalogId: 'inv_blackbird_au', confirmed: true });
    expect(admitted.ok).toBe(true);
    if (!admitted.ok) return;
    const gap = listGapsForTarget(admitted.target.id)[0];
    const blocked = resolveResearchGap({
      gapId: gap.id,
      resolution: { evidenceKind: 'AI_INTERPRETATION', summary: 'guess' },
    });
    expect(blocked.ok).toBe(false);
  });

  it('Wave 0 review table uses controlled operator actions and does not auto-admit', () => {
    const rows = buildWave0ReviewTable(12);
    expect(rows.length).toBeGreaterThanOrEqual(8);
    expect(rows.length).toBeLessThanOrEqual(12);
    const allowed = new Set(['RESEARCH_MORE', 'REVIEW', 'READY_FOR_ADMISSION', 'HOLD', 'DO_NOT_PRIORITIZE']);
    for (const r of rows) {
      expect(allowed.has(r.recommendedOperatorAction)).toBe(true);
      expect(String(r.recommendedOperatorAction)).not.toMatch(/LIKELY|PROBABILITY|EXPECTED_CLOSE/i);
    }
    expect(listTargets()).toHaveLength(0);
  });

  it('outreach stays SEND-BLOCKED and includes USP', () => {
    const admitted = admitCatalogInvestorToCampaign({ catalogId: 'inv_rampersand_au', confirmed: true });
    expect(admitted.ok).toBe(true);
    if (!admitted.ok) return;
    const draft = createOutreachDraft({
      targetId: admitted.target.id,
      draftType: 'initial_investor_email',
    });
    expect(draft.ok).toBe(true);
    if (!draft.ok) return;
    expect(draft.sends).toBe(false);
    expect((draft.draft.metadataJson as any).sendBlocked).toBe(true);
    expect(draft.draft.bodyText).toMatch(/HAVE and WANT|HAS/);
    expect(draft.draft.bodyText).toMatch(/SEND-BLOCKED/);
  });

  it('end-to-end internal rehearsal completes without external side effects', async () => {
    const result = await runWave0InternalRehearsal({
      catalogId: 'inv_airtree_au',
      resetMemory: true,
      resolveChequeWithPublicFact: true,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.sends).toBe(false);
    expect(result.externalContact).toBe(false);
    expect(result.draft?.sendBlocked).toBe(true);
    expect(result.suitcaseReadyCount).toBe(0);
    expect(result.assessments?.reciprocal?.band).toBeTruthy();
    expect(result.assessments?.capitalQualification?.band).toBeTruthy();
    expect(result.assessments?.investorFit?.kind).toBe('INVESTOR_FIT_V1');
    const types = listEvents().map((e) => e.eventType);
    expect(types).toContain(FUNDRAISING_EVENTS.INVESTOR_ADMITTED);
    expect(types).toContain(FUNDRAISING_EVENTS.OUTREACH_DRAFT_CREATED);
    expect(types).not.toContain('FAKE_FUNNEL_EVENT');
  });

  it('overview exposes USP and acquisition thesis', () => {
    const overview = getCampaignOverview();
    expect((overview.prep as any).usp.statement).toMatch(/HAVE and WANT/);
    expect((overview.prep as any).acquisitionThesis.notClaims).toEqual(
      expect.arrayContaining(['proven low CAC']),
    );
  });
});
