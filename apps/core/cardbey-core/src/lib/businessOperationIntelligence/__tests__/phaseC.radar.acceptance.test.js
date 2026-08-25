/**
 * Phase C progressive analysis / radar orchestration acceptance.
 */

import { describe, expect, it, beforeEach } from 'vitest';
import {
  adjustBusinessContext,
  advanceBusinessAnalysis,
  ANALYSIS_STAGE_STATUS,
  clearAnalysisSessions,
  confirmBusinessContext,
  createEmptyBusinessContext,
  createKnowledgeItem,
  EXISTING_ANALYSIS_STAGES,
  INTENDED_ANALYSIS_STAGES,
  KNOWLEDGE_STATES,
  startBusinessAnalysis,
  understandBusinessContext,
} from '../index.js';

async function confirmedContext(text, opts = {}) {
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
    const again = await understandBusinessContext(
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
    );
    ctx = again.context;
  }
  if (opts.adjustments) {
    ctx = adjustBusinessContext(ctx, opts.adjustments).context;
  }
  return confirmBusinessContext(ctx).context;
}

const mockGeocode = async ({ query }) => [
  {
    latitude: -37.8136,
    longitude: 144.9631,
    formattedAddress: `${query}, Victoria, Australia`,
  },
];

const mockProbeOk = async () => ({
  ok: true,
  websiteReachable: true,
  websiteUrl: 'https://example.test',
  ms: 10,
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
});

beforeEach(() => {
  clearAnalysisSessions();
});

describe('Phase C progressive analysis', () => {
  it('stage definitions are real and mode-distinct', () => {
    expect(EXISTING_ANALYSIS_STAGES.map((s) => s.id)).toContain('CHECKING_ONLINE_PRESENCE');
    expect(INTENDED_ANALYSIS_STAGES.map((s) => s.id)).toContain('IDENTIFYING_ASSUMPTIONS');
    expect(EXISTING_ANALYSIS_STAGES.find((s) => s.id === 'UNDERSTANDING_CONCEPT')).toBeFalsy();
  });

  it('Case A — existing progressive stages → snapshot with geo + offerings', async () => {
    const ctx = await confirmedContext('I run Modern Security Doors in Melbourne', {
      modeHint: 'EXISTING',
      adjustments: {
        name: 'Modern Security Doors',
        location: 'Melbourne',
        website: 'https://example.test',
      },
    });

    const started = startBusinessAnalysis({ context: ctx });
    expect(started.ok).toBe(true);
    expect(started.stages).toHaveLength(EXISTING_ANALYSIS_STAGES.length);
    expect(started.stages.every((s) => s.status === ANALYSIS_STAGE_STATUS.PENDING)).toBe(true);

    let state = started;
    for (let i = 0; i < 8; i++) {
      state = await advanceBusinessAnalysis(state.analysisId, {
        geocodeAddress: mockGeocode,
        probeWebsiteForSnapshot: mockProbeOk,
      });
      if (state.status === 'completed') break;
    }

    expect(state.status).toBe('completed');
    expect(state.geo?.available).toBe(true);
    expect(state.geo?.latitude).toBeCloseTo(-37.81, 1);
    expect(state.snapshot).toBeTruthy();
    expect(state.snapshot.offerings.count).toBe(1);
    expect(state.findings.some((f) => f.id === 'website')).toBe(true);
    // No competitor/market claims
    expect(JSON.stringify(state)).not.toMatch(/competitor|TAM|market share/i);
  });

  it('Case B — intended progressive stages → concept snapshot, idea geo', async () => {
    const ctx = await confirmedContext(
      'I want to start a mobile car detailing business in Melbourne',
    );
    const started = startBusinessAnalysis({ context: ctx });
    expect(started.mode).toBe('INTENDED');
    expect(started.ui.centerLabel).toBe('Your Business Idea');

    let state = started;
    for (let i = 0; i < 8; i++) {
      state = await advanceBusinessAnalysis(state.analysisId, {
        geocodeAddress: mockGeocode,
      });
      if (state.status === 'completed') break;
    }

    expect(state.status).toBe('completed');
    expect(state.snapshot.mode).toBe('INTENDED');
    expect(state.snapshot.offerings.status).toBe('not_applicable');
    expect(state.geo?.markerKind).toBe('idea');
    expect(state.findings.some((f) => f.id === 'concept')).toBe(true);
  });

  it('Case C — partial evidence: no website, still completes without invented offerings', async () => {
    const ctx = await confirmedContext('I run ABC Plumbing in Melbourne', {
      modeHint: 'EXISTING',
      adjustments: { name: 'ABC Plumbing', location: 'Melbourne', website: '' },
    });
    ctx.identity.website = null;
    ctx.knowledge = ctx.knowledge.filter((k) => k.field !== 'website');

    const started = startBusinessAnalysis({ context: ctx });
    let state = started;
    for (let i = 0; i < 8; i++) {
      state = await advanceBusinessAnalysis(state.analysisId, {
        geocodeAddress: mockGeocode,
      });
      if (state.status === 'completed') break;
    }

    expect(state.status).toBe('completed');
    expect(state.snapshot.offerings.items).toHaveLength(0);
    const presence = state.stages.find((s) => s.id === 'CHECKING_ONLINE_PRESENCE');
    expect(['SKIPPED', 'FAILED', 'COMPLETED'].includes(presence.status)).toBe(true);
  });

  it('Case D — location unavailable: analysis continues with fallback geo', async () => {
    const ctx = await confirmedContext('I want to start a bakery', {
      modeHint: 'INTENDED',
      adjustments: { name: 'Bakery idea', location: '' },
    });
    ctx.identity.location = null;
    ctx.knowledge = ctx.knowledge.filter((k) => k.field !== 'location');

    const started = startBusinessAnalysis({ context: ctx });
    let state = started;
    for (let i = 0; i < 8; i++) {
      state = await advanceBusinessAnalysis(state.analysisId, {
        geocodeAddress: async () => [],
      });
      if (state.status === 'completed') break;
    }

    expect(state.status).toBe('completed');
    expect(state.snapshot).toBeTruthy();
    expect(state.geo?.available).toBe(false);
    const locStage = state.stages.find((s) => s.id === 'CONFIRMING_TARGET_LOCATION');
    expect(locStage.status).toBe(ANALYSIS_STAGE_STATUS.SKIPPED);
  });

  it('Quality: every completed stage maps to defined stage ids', async () => {
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
          value: 'Test Idea',
          knowledgeState: KNOWLEDGE_STATES.USER_DEFINED,
        }),
      ],
      identity: {
        name: 'Test Idea',
        businessType: null,
        category: null,
        location: null,
        website: null,
        operatingModel: null,
      },
    });

    const started = startBusinessAnalysis({ context: ctx });
    let state = started;
    for (let i = 0; i < 8; i++) {
      state = await advanceBusinessAnalysis(state.analysisId, {
        geocodeAddress: async () => [],
      });
      if (state.status === 'completed') break;
    }

    const allowed = new Set(INTENDED_ANALYSIS_STAGES.map((s) => s.id));
    for (const s of state.stages) {
      expect(allowed.has(s.id)).toBe(true);
      expect(
        ['COMPLETED', 'FAILED', 'SKIPPED'].includes(s.status),
      ).toBe(true);
    }
  });
});
