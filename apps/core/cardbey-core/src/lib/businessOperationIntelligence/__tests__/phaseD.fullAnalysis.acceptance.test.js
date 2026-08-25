/**
 * Phase D full analysis + growth/launch plan acceptance.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import {
  adjustBusinessContext,
  advanceFullAnalysis,
  clearAnalysisSessions,
  confirmBusinessContext,
  createEmptyBusinessContext,
  createKnowledgeItem,
  discoverCompetitorCandidates,
  isBusinessFullAnalysisV1Enabled,
  KNOWLEDGE_STATES,
  startFullAnalysis,
  understandBusinessContext,
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

const mockPlacesStrong = async () => [
  {
    name: 'Rival Security Screens',
    location: 'Melbourne VIC',
    placeId: 'p1',
    types: ['security', 'door', 'installation'],
    website: null,
  },
  {
    name: 'Random Cafe',
    location: 'Melbourne VIC',
    placeId: 'p2',
    types: ['cafe', 'food'],
  },
];

beforeEach(() => {
  clearAnalysisSessions();
  delete process.env.ENABLE_BUSINESS_FULL_ANALYSIS_V1;
});

describe('Phase D full analysis', () => {
  it('feature flag defaults OFF', () => {
    expect(isBusinessFullAnalysisV1Enabled()).toBe(false);
  });

  it('A. Existing with strong evidence → analysis + actions', async () => {
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
          {
            name: 'Security Screen Door',
            knowledgeState: KNOWLEDGE_STATES.DISCOVERED_FACT,
            source: 'website_menu_lines',
            confidence: 0.8,
          },
        ],
        social: [],
        description: 'Doors',
        deepUsed: false,
        deepFailed: null,
      }),
      discoverCompetitorCandidates: async () =>
        discoverCompetitorCandidates(
          {
            businessName: 'Modern Security Doors',
            businessType: 'Security doors',
            location: 'Melbourne',
          },
          { searchGooglePlaces: mockPlacesStrong },
        ),
    });

    expect(state.status).toBe('completed');
    expect(state.report.mode).toBe('EXISTING');
    expect(state.report.reportKind).toMatch(/Growth Plan/i);
    expect(state.report.recommendations.length).toBeGreaterThan(0);
    expect(state.report.plan.day30.length).toBeGreaterThan(0);
    expect(state.report.competitorCandidates.some((c) => /Rival/i.test(c.name))).toBe(true);
    expect(state.report.competitorCandidates.every((c) => !/#1|rank/i.test(c.note || ''))).toBe(
      true,
    );
    // Cafe should be filtered as weak relevance
    expect(state.report.competitorCandidates.some((c) => /Cafe/i.test(c.name))).toBe(false);
    expect(JSON.stringify(state.report)).not.toMatch(/demand is high|TAM|revenue forecast|probability of success/i);
  });

  it('B. Existing weak evidence → limited report + limits', async () => {
    const ctx = await confirmed('I run Quiet Co in Perth', {
      modeHint: 'EXISTING',
      adjustments: { name: 'Quiet Co', location: 'Perth', website: '' },
    });
    ctx.identity.website = null;
    ctx.knowledge = ctx.knowledge.filter((k) => k.field !== 'website');

    const state = await runFull(ctx, {
      discoverCompetitorCandidates: async () => ({
        ok: true,
        candidates: [],
        marketContext: {
          similarBusinessCount: 0,
          areaLabel: 'Perth',
          statement: 'Cardbey did not identify enough similar businesses in the selected area to show comparisons.',
          knowledgeState: KNOWLEDGE_STATES.DISCOVERED_FACT,
          limitations: 'Presence context only.',
        },
        skipped: false,
      }),
    });

    expect(state.report.evidenceSummary.limitations.length).toBeGreaterThan(0);
    expect(state.report.offerings?.count || 0).toBe(0);
    expect(state.report.gaps.some((g) => /website|offering/i.test(g.title + g.detail))).toBe(true);
  });

  it('C. Intended service startup → concept + launch plan', async () => {
    const ctx = await confirmed(
      'I want to start a mobile car detailing business in Melbourne',
    );
    const state = await runFull(ctx, {
      discoverCompetitorCandidates: async () => ({
        ok: true,
        candidates: [],
        marketContext: null,
        skipped: true,
      }),
    });
    expect(state.report.mode).toBe('INTENDED');
    expect(state.report.reportKind).toMatch(/Launch Plan/i);
    expect(state.report.plan.day90.length).toBeGreaterThan(0);
    expect(state.report.risks.some((r) => /viability/i.test(r.title))).toBe(true);
    expect(state.report.recommendations.every((r) => r.knowledgeState === 'RECOMMENDATION')).toBe(
      true,
    );
  });

  it('D. Intended product business — no operating facts invented', async () => {
    const ctx = await confirmed("I'm planning a custom packaging company in Ho Chi Minh City");
    const state = await runFull(ctx, {
      discoverCompetitorCandidates: async () => ({
        ok: true,
        candidates: [],
        marketContext: null,
        skipped: true,
      }),
    });
    expect(state.report.businessContext.website).toBeNull();
    expect(JSON.stringify(state.report)).not.toMatch(/current revenue|existing customers|market share/i);
  });

  it('E. Competitor candidates require relevance — not auto-nearby', async () => {
    const result = await discoverCompetitorCandidates(
      {
        businessName: 'Modern Security Doors',
        businessType: 'Security doors',
        location: 'Melbourne',
      },
      { searchGooglePlaces: mockPlacesStrong },
    );
    expect(result.candidates.every((c) => c.whyRelevant && c.confidence >= 0.45)).toBe(true);
    expect(result.candidates.every((c) => c.classification !== 'competitor')).toBe(true);
    expect(result.marketContext.statement).toMatch(/similar business/i);
    expect(result.marketContext.limitations).toMatch(/not demand/i);
  });

  it('F. Missing market evidence — no demand claims', async () => {
    const ctx = createEmptyBusinessContext({
      sourceText: 'idea',
      mode: 'INTENDED',
      status: 'CONFIRMED',
      confirmation: {
        confirmed: true,
        confirmedAt: new Date().toISOString(),
        confirmedBy: 'user',
        summary: 't',
      },
      knowledge: [
        createKnowledgeItem({
          field: 'mode',
          value: 'INTENDED',
          knowledgeState: KNOWLEDGE_STATES.USER_DEFINED,
        }),
        createKnowledgeItem({
          field: 'name',
          value: 'Idea Co',
          knowledgeState: KNOWLEDGE_STATES.USER_DEFINED,
        }),
      ],
      identity: {
        name: 'Idea Co',
        businessType: null,
        category: null,
        location: null,
        website: null,
        operatingModel: null,
      },
    });
    const state = await runFull(ctx, {
      discoverCompetitorCandidates: async () => ({
        ok: true,
        candidates: [],
        marketContext: {
          similarBusinessCount: null,
          areaLabel: null,
          statement: null,
          knowledgeState: KNOWLEDGE_STATES.ASSUMPTION,
          limitations: 'Insufficient type/location',
        },
        skipped: true,
      }),
    });
    expect(JSON.stringify(state.report)).not.toMatch(/demand is high|market opportunity score/i);
  });
});
