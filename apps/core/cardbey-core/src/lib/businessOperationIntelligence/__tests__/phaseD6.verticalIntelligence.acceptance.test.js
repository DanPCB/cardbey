/**
 * Phase D6 — vertical intelligence + specificity gate acceptance.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import {
  adjustBusinessContext,
  advanceFullAnalysis,
  applySpecificityGate,
  classifyRecommendationSpecificity,
  clearAnalysisSessions,
  confirmBusinessContext,
  discoverCompetitorCandidates,
  extractBusinessSignals,
  KNOWLEDGE_STATES,
  resolveVerticalArchetype,
  SPECIFICITY,
  startFullAnalysis,
  understandBusinessContext,
  VERTICAL_ARCHETYPES,
} from '../index.js';

async function confirmed(text, opts = {}) {
  const first = await understandBusinessContext(
    { text, modeHint: opts.modeHint ?? null },
    {
      resolveBusinessEntity: async () => ({
        candidates: [],
        confidence: 0,
        requiresOwnerConfirmation: true,
        resolutionNotes: [],
      }),
      classifyBusiness: async () => ({
        verticalSlug: 'services.general',
        verticalGroup: 'services',
        confidence: 0.8,
        businessDescriptionShort: 'Services',
        keywords: [],
      }),
    },
  );
  let ctx = first.context;
  if (first.nextStep === 'clarify_mode' && opts.modeHint) {
    ctx = (
      await understandBusinessContext(
        { text, modeHint: opts.modeHint },
        {
          resolveBusinessEntity: async () => ({
            candidates: [],
            confidence: 0,
            requiresOwnerConfirmation: true,
            resolutionNotes: [],
          }),
          classifyBusiness: async () => ({
            verticalSlug: 'services.general',
            verticalGroup: 'services',
            confidence: 0.8,
            businessDescriptionShort: 'Services',
            keywords: [],
          }),
        },
      )
    ).context;
  }
  if (opts.adjustments) ctx = adjustBusinessContext(ctx, opts.adjustments).context;
  return confirmBusinessContext(ctx).context;
}

async function runFull(ctx, deps = {}) {
  const started = startFullAnalysis({ context: ctx }, { forceEnable: true, ...deps });
  expect(started.ok).toBe(true);
  let state = started;
  for (let i = 0; i < 10; i++) {
    state = await advanceFullAnalysis(state.analysisId, { forceEnable: true, ...deps });
    if (state.status === 'completed') break;
  }
  return state;
}

beforeEach(() => {
  clearAnalysisSessions();
  delete process.env.ENABLE_BUSINESS_FULL_ANALYSIS_V1;
  delete process.env.ENABLE_BOI_D6_LLM_ENRICHMENT;
});

describe('Phase D6 vertical intelligence', () => {
  it('resolves hospitality vs local service archetypes', () => {
    expect(
      resolveVerticalArchetype({
        mode: 'EXISTING',
        context: { identity: { businessType: 'Vietnamese restaurant', name: 'Pho' } },
      }).id,
    ).toBe(VERTICAL_ARCHETYPES.HOSPITALITY);
    expect(
      resolveVerticalArchetype({
        mode: 'EXISTING',
        context: { identity: { businessType: 'Security doors', name: 'Modern Security Doors' } },
      }).id,
    ).toBe(VERTICAL_ARCHETYPES.LOCAL_SERVICE);
  });

  it('rich existing evidence → evidence-specific recommendations (not generic templates)', async () => {
    const ctx = await confirmed('I run Modern Security Doors in Melbourne', {
      modeHint: 'EXISTING',
      adjustments: {
        name: 'Modern Security Doors',
        location: 'Melbourne',
        website: 'https://doors.test',
        businessType: 'Security doors',
      },
    });

    const state = await runFull(ctx, {
      probeWebsiteForSnapshot: async () => ({
        ok: true,
        websiteReachable: true,
        websiteUrl: 'https://doors.test',
        ms: 5,
        offerings: [
          { name: 'Security Screen Door', knowledgeState: KNOWLEDGE_STATES.DISCOVERED_FACT },
          { name: 'Pet Door Insert', knowledgeState: KNOWLEDGE_STATES.DISCOVERED_FACT },
          { name: 'Door Installation', knowledgeState: KNOWLEDGE_STATES.DISCOVERED_FACT },
        ],
        social: [{ network: 'facebook', url: 'https://facebook.com/x' }],
        description: 'Security door manufacturing and installation',
        deepUsed: false,
        deepFailed: null,
      }),
      discoverCompetitorCandidates: async () =>
        discoverCompetitorCandidates(
          {
            businessName: 'Modern Security Doors',
            businessType: 'Security doors',
            location: 'Melbourne',
            offerings: ['Security Screen Door', 'Pet Door Insert'],
            mode: 'EXISTING',
          },
          {
            searchGooglePlaces: async () => [
              {
                name: 'Rival Security Screens',
                location: 'Melbourne',
                placeId: 'p1',
                types: ['security', 'door', 'installation'],
              },
              {
                name: 'Melbourne Thai Kitchen',
                location: 'Melbourne',
                placeId: 'p2',
                types: ['restaurant', 'food'],
              },
            ],
          },
        ),
    });

    expect(state.report.phase).toBe('D6');
    expect(state.report.vertical?.id).toBe(VERTICAL_ARCHETYPES.LOCAL_SERVICE);
    expect(state.report.signals?.length).toBeGreaterThan(2);
    expect(state.report.recommendations.length).toBeGreaterThan(0);
    expect(
      state.report.recommendations.every((r) =>
        ['EVIDENCE_SPECIFIC', 'BUSINESS_SPECIFIC'].includes(r.specificity),
      ),
    ).toBe(true);
    expect(JSON.stringify(state.report.recommendations)).not.toMatch(
      /Create a structured business offering catalogue|Prepare clear business messaging/i,
    );
    expect(state.report.competitorCandidates.some((c) => /Rival/i.test(c.name))).toBe(true);
    expect(state.report.competitorCandidates.some((c) => /Thai Kitchen|Cafe/i.test(c.name))).toBe(
      false,
    );
    expect(state.report.plan.day30[0].action).toMatch(/Modern Security|service-area|offering|enquiry/i);
  });

  it('specificity gate suppresses generic padding', () => {
    const gated = applySpecificityGate([
      {
        id: 'g1',
        recommendation: 'Improve your website.',
        specificity: SPECIFICITY.GENERIC,
        evidenceRefs: [],
      },
      {
        id: 'g2',
        businessSpecificObservation: 'Cardbey identified 6 services but could not verify service area.',
        recommendedAction: 'Publish suburbs for ABC Plumbing in Melbourne.',
        specificity: SPECIFICITY.EVIDENCE_SPECIFIC,
        evidenceRefs: ['snapshot.offerings'],
      },
    ]);
    expect(gated.recommendations).toHaveLength(1);
    expect(gated.recommendations[0].id).toBe('g2');
  });

  it('classifier distinguishes evidence-specific from generic', () => {
    expect(
      classifyRecommendationSpecificity({
        text: 'Improve your website.',
        evidenceRefs: [],
      }),
    ).toBe(SPECIFICITY.GENERIC);
    expect(
      classifyRecommendationSpecificity({
        text: 'Cardbey identified 6 plumbing services but could not verify the geographic service area.',
        evidenceRefs: ['snapshot.offerings'],
        offeringCount: 6,
        businessName: 'ABC Plumbing',
        location: 'Melbourne',
      }),
    ).toBe(SPECIFICITY.EVIDENCE_SPECIFIC);
  });

  it('intended capability model is verticalized', async () => {
    const ctx = await confirmed('I want to start a mobile car detailing business in Melbourne');
    const state = await runFull(ctx, {
      discoverCompetitorCandidates: async () => ({
        ok: true,
        candidates: [],
        marketContext: null,
        skipped: true,
      }),
    });
    expect(state.report.vertical?.id).toBe(VERTICAL_ARCHETYPES.STARTUP_SERVICE);
    expect(state.report.recommendations.some((r) => /detail|mobile|service/i.test(r.recommendedAction))).toBe(
      true,
    );
    expect(state.report.customerSegmentHypotheses?.length).toBeGreaterThan(0);
    expect(state.report.gaps.some((g) => /offering|service area|operating/i.test(g.title))).toBe(true);
    expect(JSON.stringify(state.report)).not.toMatch(/demand is high|TAM|revenue forecast/i);
  });

  it('signals do not invent unsupported facts', () => {
    const signals = extractBusinessSignals({
      context: {
        mode: 'EXISTING',
        identity: { name: 'Quiet Co', location: 'Perth', website: null, businessType: 'Services' },
      },
      snapshot: {
        mode: 'EXISTING',
        identity: {
          name: { value: 'Quiet Co' },
          location: { value: 'Perth' },
          website: { value: null },
        },
        offerings: { status: 'absent', count: 0, items: [] },
        digitalPresence: { status: 'website_not_found', social: [] },
        failures: [],
      },
      vertical: VERTICAL_ARCHETYPES.GENERAL,
    });
    expect(signals.some((s) => s.type === 'WEBSITE_MISSING')).toBe(true);
    expect(signals.some((s) => s.type === 'STRUCTURED_CATALOG_PRESENT')).toBe(false);
    expect(signals.every((s) => s.observation && s.knowledgeState)).toBe(true);
  });
});
