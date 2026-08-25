/**
 * Progressive full-analysis orchestrator — Phase D.
 */

import { ANALYSIS_STAGE_STATUS, createPendingStage, patchStage } from './analysisStages.js';
import {
  getAnalysisSession,
  putAnalysisSession,
  updateAnalysisSession,
} from './analysisSessionStore.js';
import { buildBusinessSnapshot } from './buildBusinessSnapshot.js';
import { buildExistingFullAnalysis } from './buildExistingFullAnalysis.js';
import { buildIntendedFullAnalysis } from './buildIntendedFullAnalysis.js';
import { enrichRecommendationWording } from './llmRecommendationEnrichment.js';
import { fullAnalysisStagesForMode } from './fullAnalysisTypes.js';
import { buildFullAnalysisPreview } from './fullAnalysisPreview.js';
import {
  BUSINESS_CONTEXT_MODES,
  BUSINESS_CONTEXT_STATUS,
  validateBusinessContextShape,
} from './types.js';

/**
 * Feature gate — default OFF.
 */
export function isBusinessFullAnalysisV1Enabled() {
  const raw = String(process.env.ENABLE_BUSINESS_FULL_ANALYSIS_V1 ?? '')
    .trim()
    .toLowerCase();
  return raw === 'true' || raw === '1' || raw === 'on' || raw === 'yes';
}

/** Public pilot productization — default OFF. Does not enable payment. */
export function isBusinessOperationPilotV1Enabled() {
  const raw = String(process.env.ENABLE_BUSINESS_OPERATION_PILOT_V1 ?? '')
    .trim()
    .toLowerCase();
  return raw === 'true' || raw === '1' || raw === 'on' || raw === 'yes';
}

/**
 * @param {{ context: object, snapshot?: object | null }} input
 */
export function startFullAnalysis(input, deps = {}) {
  if (!isBusinessFullAnalysisV1Enabled() && !deps.forceEnable) {
    return {
      ok: false,
      error: 'feature_disabled',
      message: 'Full business analysis is not enabled.',
    };
  }

  const context = input?.context;
  const shape = validateBusinessContextShape(context);
  if (!shape.ok) {
    return { ok: false, error: 'invalid_context', message: shape.errors.join('; ') };
  }
  if (context.status !== BUSINESS_CONTEXT_STATUS.CONFIRMED || !context.confirmation?.confirmed) {
    return {
      ok: false,
      error: 'context_not_confirmed',
      message: 'Confirm BusinessContext before full analysis.',
    };
  }
  if (!context.mode) {
    return { ok: false, error: 'mode_required', message: 'Mode required.' };
  }

  const analysisId = `bofa_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  const defs = fullAnalysisStagesForMode(context.mode);
  const session = {
    kind: 'full_analysis',
    analysisId,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    mode: context.mode,
    context,
    snapshot: input.snapshot || null,
    status: 'running',
    stages: defs.map(createPendingStage),
    findings: [],
    report: null,
    draft: {},
    deps,
  };
  putAnalysisSession(session);

  return {
    ok: true,
    analysisId,
    status: 'running',
    mode: context.mode,
    stages: session.stages,
    findings: [],
    report: null,
    ui: {
      headline:
        context.mode === 'INTENDED'
          ? 'Preparing concept analysis + launch plan…'
          : 'Preparing business analysis + growth plan…',
      tone: context.mode === 'INTENDED' ? 'intended' : 'existing',
      reportTitle:
        context.mode === 'INTENDED'
          ? 'Business Concept Analysis + Launch Plan'
          : 'Business Analysis + Growth Plan',
    },
  };
}

/**
 * @param {string} analysisId
 * @param {object} [deps]
 */
export async function advanceFullAnalysis(analysisId, deps = {}) {
  const session = getAnalysisSession(analysisId);
  if (!session || session.kind !== 'full_analysis') {
    return { ok: false, error: 'not_found', message: 'Full analysis session expired or unknown.' };
  }
  if (session.status === 'completed') return publicFullView(session);

  const mergedDeps = { ...session.deps, ...deps };
  const idx = session.stages.findIndex((s) => s.status === ANALYSIS_STAGE_STATUS.PENDING);
  if (idx < 0) {
    updateAnalysisSession(analysisId, { status: 'completed' });
    return publicFullView(getAnalysisSession(analysisId));
  }

  const stage = session.stages[idx];
  session.stages[idx] = patchStage(stage, {
    status: ANALYSIS_STAGE_STATUS.RUNNING,
    startedAt: new Date().toISOString(),
  });
  updateAnalysisSession(analysisId, { stages: session.stages });

  try {
    const outcome = await runFullStage(session, stage.id, mergedDeps);
    session.stages[idx] = patchStage(session.stages[idx], {
      status: outcome.status || ANALYSIS_STAGE_STATUS.COMPLETED,
      completedAt: new Date().toISOString(),
      resultSummary: outcome.resultSummary ?? null,
      evidenceCount: outcome.evidenceCount ?? null,
      failureReason: outcome.failureReason ?? null,
    });
    if (outcome.finding) session.findings.push(outcome.finding);
    if (outcome.snapshot) session.snapshot = outcome.snapshot;
    if (outcome.report) session.report = outcome.report;
    if (outcome.draft) session.draft = { ...session.draft, ...outcome.draft };

    const allDone = session.stages.every((s) =>
      ['COMPLETED', 'FAILED', 'SKIPPED'].includes(s.status),
    );
    updateAnalysisSession(analysisId, {
      stages: session.stages,
      findings: session.findings,
      snapshot: session.snapshot,
      report: session.report,
      draft: session.draft,
      status: allDone ? 'completed' : 'running',
    });
  } catch (err) {
    session.stages[idx] = patchStage(session.stages[idx], {
      status: ANALYSIS_STAGE_STATUS.FAILED,
      completedAt: new Date().toISOString(),
      resultSummary: 'Information unavailable',
      failureReason: 'stage_failed',
    });
    updateAnalysisSession(analysisId, { stages: session.stages });
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[full-analysis] stage error', stage.id, err?.message || err);
    }
  }

  return publicFullView(getAnalysisSession(analysisId));
}

export function getFullAnalysis(analysisId) {
  const session = getAnalysisSession(analysisId);
  if (!session || session.kind !== 'full_analysis') {
    return { ok: false, error: 'not_found', message: 'Full analysis session expired or unknown.' };
  }
  return publicFullView(session);
}

function publicFullView(session) {
  const pilot = isBusinessOperationPilotV1Enabled();
  const preview =
    session.status === 'completed' && session.report
      ? buildFullAnalysisPreview(session.report)
      : null;
  const exposeFullReport = session.status === 'completed' && session.report && !pilot;

  return {
    ok: true,
    analysisId: session.analysisId,
    status: session.status,
    mode: session.mode,
    stages: session.stages,
    findings: session.findings,
    /** Full report only when pilot productization is OFF (internal). */
    report: exposeFullReport ? session.report : null,
    preview: preview?.ok ? preview : null,
    snapshotId: session.snapshot?.snapshotId || null,
    contextId: session.context?.contextId || null,
    ui: {
      headline:
        session.status === 'completed'
          ? pilot
            ? 'Your business analysis is ready'
            : session.mode === 'INTENDED'
              ? 'Business Concept Analysis + Launch Plan'
              : 'Business Analysis + Growth Plan'
          : session.mode === 'INTENDED'
            ? 'Preparing concept analysis + launch plan…'
            : 'Preparing business analysis + growth plan…',
      tone: session.mode === 'INTENDED' ? 'intended' : 'existing',
      nextStep:
        session.status === 'completed' && session.report
          ? pilot
            ? 'full_preview'
            : 'full_report'
          : 'analysing',
      pilotProductization: pilot,
    },
  };
}

async function runFullStage(session, stageId, deps) {
  const ctx = session.context;
  const mode = session.mode;

  // Ensure snapshot exists once (reuse Phase B)
  if (!session.snapshot && (stageId === 'REVIEWING_EVIDENCE' || stageId === 'REVIEWING_CONCEPT')) {
    const snapRes = await buildBusinessSnapshot({ context: ctx }, deps);
    if (snapRes.ok) session.snapshot = snapRes.snapshot;
  }

  if (mode === BUSINESS_CONTEXT_MODES.INTENDED) {
    return runIntendedFullStage(session, stageId, deps);
  }
  return runExistingFullStage(session, stageId, deps);
}

async function runExistingFullStage(session, stageId, deps) {
  const snap = session.snapshot;
  switch (stageId) {
    case 'REVIEWING_EVIDENCE':
      return {
        status: ANALYSIS_STAGE_STATUS.COMPLETED,
        resultSummary: `${(session.context.knowledge || []).length} knowledge item(s)`,
        evidenceCount: (session.context.knowledge || []).length,
        snapshot: snap,
        finding: {
          id: 'evidence',
          title: 'Evidence reviewed',
          detail: 'Confirmed context and free snapshot evidence loaded.',
          status: 'ok',
        },
      };
    case 'COMPARING_CONTEXT': {
      // Partial: competitor discovery runs inside full builder; here we pre-run for finding
      const { discoverCompetitorCandidates } = await import('./competitorCandidates.js');
      const discover = deps.discoverCompetitorCandidates || discoverCompetitorCandidates;
      const cmp = await discover(
        {
          businessName: session.context.identity?.name,
          businessType: session.context.identity?.businessType,
          category: session.context.identity?.category,
          location: session.context.identity?.location,
        },
        deps,
      );
      session.draft.competitor = cmp;
      return {
        status: ANALYSIS_STAGE_STATUS.COMPLETED,
        resultSummary: cmp.marketContext?.statement || 'Local context reviewed',
        evidenceCount: (cmp.candidates || []).length,
        draft: { competitor: cmp },
        finding: {
          id: 'context',
          title: 'Local context reviewed',
          detail: cmp.marketContext?.statement || 'No similar-business context available.',
          status: 'ok',
        },
      };
    }
    case 'IDENTIFYING_GAPS':
      return {
        status: ANALYSIS_STAGE_STATUS.COMPLETED,
        resultSummary: `${(snap?.readiness?.findings || []).filter((f) => f.status === 'gap').length} readiness gap signal(s)`,
        finding: {
          id: 'gaps',
          title: 'Gaps identified',
          detail: 'Gaps derived from snapshot readiness and missing evidence only.',
          status: 'ok',
        },
      };
    case 'EVALUATING_OPPORTUNITIES':
      return {
        status: ANALYSIS_STAGE_STATUS.COMPLETED,
        resultSummary: 'Opportunities linked to observed gaps',
        finding: {
          id: 'opps',
          title: 'Opportunities drafted',
          detail: 'Only gap-derived opportunities — no demand scores.',
          status: 'ok',
        },
      };
    case 'PREPARING_RECOMMENDATIONS':
      return {
        status: ANALYSIS_STAGE_STATUS.COMPLETED,
        resultSummary: 'Structured recommendations',
        finding: {
          id: 'recs',
          title: 'Recommendations ready',
          detail: 'Each recommendation retains evidence and limitations.',
          status: 'ok',
        },
      };
    case 'BUILDING_PLAN': {
      const report = await buildExistingFullAnalysis(
        { context: session.context, snapshot: snap },
        { enrichRecommendationWording, ...deps },
      );
      return {
        status: ANALYSIS_STAGE_STATUS.COMPLETED,
        resultSummary: 'Growth plan ready',
        report,
        finding: {
          id: 'plan',
          title: '30/60/90 plan ready',
          detail: 'Prioritized actions without guaranteed outcomes.',
          status: 'ok',
        },
      };
    }
    default:
      return { status: ANALYSIS_STAGE_STATUS.SKIPPED, resultSummary: 'Unknown stage' };
  }
}

async function runIntendedFullStage(session, stageId, deps) {
  const snap = session.snapshot;
  switch (stageId) {
    case 'REVIEWING_CONCEPT':
      return {
        status: ANALYSIS_STAGE_STATUS.COMPLETED,
        resultSummary: session.context.identity?.name || session.context.identity?.businessType || 'Concept',
        snapshot: snap,
        finding: {
          id: 'concept',
          title: 'Concept reviewed',
          detail: 'Intended business context loaded.',
          status: 'ok',
        },
      };
    case 'STRUCTURING_ASSUMPTIONS':
      return {
        status: ANALYSIS_STAGE_STATUS.COMPLETED,
        resultSummary: `${(snap?.assumptions || []).length} assumption(s)`,
        evidenceCount: (snap?.assumptions || []).length,
        finding: {
          id: 'assumptions',
          title: 'Assumptions structured',
          detail: 'USER_DEFINED vs AI_INFERENCE retained.',
          status: 'ok',
        },
      };
    case 'IDENTIFYING_VALIDATION_GAPS':
      return {
        status: ANALYSIS_STAGE_STATUS.COMPLETED,
        resultSummary: `${(snap?.informationGaps || []).length} validation item(s)`,
        finding: {
          id: 'validation',
          title: 'Validation needs listed',
          detail: 'Missing real-world confirmation items.',
          status: 'ok',
        },
      };
    case 'MAPPING_CAPABILITY_REQUIREMENTS':
      return {
        status: ANALYSIS_STAGE_STATUS.COMPLETED,
        resultSummary: 'Launch requirements mapped',
        finding: {
          id: 'capabilities',
          title: 'Launch requirements mapped',
          detail: 'Planning requirements — not discovered operating facts.',
          status: 'ok',
        },
      };
    case 'PREPARING_RECOMMENDATIONS':
      return {
        status: ANALYSIS_STAGE_STATUS.COMPLETED,
        resultSummary: 'Launch recommendations',
        finding: {
          id: 'recs',
          title: 'Recommendations ready',
          detail: 'Prioritized without viability claims.',
          status: 'ok',
        },
      };
    case 'BUILDING_LAUNCH_PLAN': {
      const report = await buildIntendedFullAnalysis(
        { context: session.context, snapshot: snap },
        { enrichRecommendationWording, ...deps },
      );
      return {
        status: ANALYSIS_STAGE_STATUS.COMPLETED,
        resultSummary: 'Launch plan ready',
        report,
        finding: {
          id: 'plan',
          title: '30/60/90 launch plan ready',
          detail: 'Validate → build minimum → test.',
          status: 'ok',
        },
      };
    }
    default:
      return { status: ANALYSIS_STAGE_STATUS.SKIPPED, resultSummary: 'Unknown stage' };
  }
}
