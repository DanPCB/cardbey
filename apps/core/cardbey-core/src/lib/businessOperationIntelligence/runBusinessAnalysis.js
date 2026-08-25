/**
 * Progressive business analysis orchestrator — Phase C.
 * Advances real stages one-at-a-time; reuses Phase B snapshot builders + geocode + website probe.
 */

import { geocodeAddress } from '../location/locationGeocodeService.js';
import { probeWebsiteForSnapshot } from './lightWebsiteProbe.js';
import { buildExistingBusinessSnapshot } from './buildExistingSnapshot.js';
import { buildIntendedBusinessSnapshot } from './buildIntendedSnapshot.js';
import {
  ANALYSIS_STAGE_STATUS,
  createPendingStage,
  patchStage,
  stageDefinitionsForMode,
} from './analysisStages.js';
import {
  getAnalysisSession,
  putAnalysisSession,
  updateAnalysisSession,
} from './analysisSessionStore.js';
import {
  BUSINESS_CONTEXT_MODES,
  BUSINESS_CONTEXT_STATUS,
  validateBusinessContextShape,
} from './types.js';
import { knowledgeForField } from './snapshotTypes.js';
import { isBusinessFullAnalysisV1Enabled } from './runFullAnalysis.js';

/**
 * @param {{ context: import('./types.js').BusinessContext }} input
 * @param {object} [deps]
 */
export function startBusinessAnalysis(input, deps = {}) {
  const context = input?.context;
  const shape = validateBusinessContextShape(context);
  if (!shape.ok) {
    return { ok: false, error: 'invalid_context', message: shape.errors.join('; ') };
  }
  if (context.status !== BUSINESS_CONTEXT_STATUS.CONFIRMED || !context.confirmation?.confirmed) {
    return {
      ok: false,
      error: 'context_not_confirmed',
      message: 'Confirm BusinessContext before analysis.',
    };
  }
  if (!context.mode) {
    return { ok: false, error: 'mode_required', message: 'Mode required.' };
  }

  const analysisId = `boa_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  const defs = stageDefinitionsForMode(context.mode);
  const session = {
    analysisId,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    mode: context.mode,
    context,
    status: 'running',
    stages: defs.map(createPendingStage),
    findings: [],
    geo: null,
    probe: null,
    snapshot: null,
    cursor: 0,
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
    geo: null,
    snapshot: null,
    ui: uiMeta(context.mode),
  };
}

/**
 * Advance the next pending stage (real work). Idempotent when already complete.
 * @param {string} analysisId
 * @param {object} [deps]
 */
export async function advanceBusinessAnalysis(analysisId, deps = {}) {
  const session = getAnalysisSession(analysisId);
  if (!session) {
    return { ok: false, error: 'not_found', message: 'Analysis session expired or unknown.' };
  }
  if (session.status === 'completed') {
    return publicView(session);
  }

  const mergedDeps = { ...session.deps, ...deps };
  const idx = session.stages.findIndex((s) => s.status === ANALYSIS_STAGE_STATUS.PENDING);
  if (idx < 0) {
    const done = updateAnalysisSession(analysisId, { status: 'completed' });
    return publicView(done);
  }

  const stage = session.stages[idx];
  const now = new Date().toISOString();
  session.stages[idx] = patchStage(stage, {
    status: ANALYSIS_STAGE_STATUS.RUNNING,
    startedAt: now,
  });
  updateAnalysisSession(analysisId, { stages: session.stages });

  try {
    const outcome = await runStage(session, stage.id, mergedDeps);
    session.stages[idx] = patchStage(session.stages[idx], {
      status: outcome.status || ANALYSIS_STAGE_STATUS.COMPLETED,
      completedAt: new Date().toISOString(),
      resultSummary: outcome.resultSummary ?? null,
      evidenceCount: outcome.evidenceCount ?? null,
      failureReason: outcome.failureReason ?? null,
    });
    if (outcome.finding) session.findings.push(outcome.finding);
    if (outcome.geo) session.geo = outcome.geo;
    if (outcome.probe !== undefined) session.probe = outcome.probe;
    if (outcome.snapshot) session.snapshot = outcome.snapshot;

    const allDone = session.stages.every(
      (s) =>
        s.status === ANALYSIS_STAGE_STATUS.COMPLETED ||
        s.status === ANALYSIS_STAGE_STATUS.FAILED ||
        s.status === ANALYSIS_STAGE_STATUS.SKIPPED,
    );
    updateAnalysisSession(analysisId, {
      stages: session.stages,
      findings: session.findings,
      geo: session.geo,
      probe: session.probe,
      snapshot: session.snapshot,
      status: allDone ? 'completed' : 'running',
      cursor: idx + 1,
    });
  } catch (err) {
    session.stages[idx] = patchStage(session.stages[idx], {
      status: ANALYSIS_STAGE_STATUS.FAILED,
      completedAt: new Date().toISOString(),
      failureReason: 'Stage failed',
      resultSummary: 'Information unavailable',
    });
    updateAnalysisSession(analysisId, {
      stages: session.stages,
      status: 'running',
    });
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[business-analysis] stage error', stage.id, err?.message || err);
    }
  }

  return publicView(getAnalysisSession(analysisId));
}

/**
 * @param {string} analysisId
 */
export function getBusinessAnalysis(analysisId) {
  const session = getAnalysisSession(analysisId);
  if (!session) {
    return { ok: false, error: 'not_found', message: 'Analysis session expired or unknown.' };
  }
  return publicView(session);
}

function publicView(session) {
  return {
    ok: true,
    analysisId: session.analysisId,
    status: session.status,
    mode: session.mode,
    stages: session.stages,
    findings: session.findings,
    geo: session.geo,
    snapshot: session.snapshot,
    contextId: session.context?.contextId || null,
    ui: {
      ...uiMeta(session.mode),
      nextStep: session.status === 'completed' && session.snapshot ? 'snapshot' : 'analysing',
      headline:
        session.status === 'completed'
          ? session.mode === 'INTENDED'
            ? 'Your business idea at a glance'
            : 'Your business at a glance'
          : session.mode === 'INTENDED'
            ? 'Exploring your idea…'
            : 'Analysing your business…',
    },
  };
}

function uiMeta(mode) {
  return {
    tone: mode === 'INTENDED' ? 'intended' : 'existing',
    centerLabel: mode === 'INTENDED' ? 'Your Business Idea' : 'Your Business',
    ctas:
      mode === 'INTENDED'
        ? [{ id: 'create', label: 'Create this business on Cardbey', href: '/for-business' }]
        : [
            { id: 'mine', label: 'This is my business', href: '/for-business' },
            { id: 'claim', label: 'Create / claim on Cardbey', href: '/for-business' },
          ],
    // Phase D CTA — enabled only when full-analysis flag is on (still free / no payment)
    fullAnalysisCta: {
      enabled: isBusinessFullAnalysisV1Enabled(),
      label:
        mode === 'INTENDED'
          ? 'See Full Concept Analysis + Launch Plan'
          : 'See Full Business Analysis + Growth Plan',
      supporting:
        'Explore deeper opportunities, risks and practical next steps for your business.',
      state: isBusinessFullAnalysisV1Enabled() ? 'available' : 'coming_next',
    },
  };
}

/**
 * @param {object} session
 * @param {string} stageId
 * @param {object} deps
 */
async function runStage(session, stageId, deps) {
  const ctx = session.context;
  const mode = session.mode;

  if (mode === BUSINESS_CONTEXT_MODES.INTENDED) {
    return runIntendedStage(session, stageId, deps);
  }
  return runExistingStage(session, stageId, deps);
}

async function runExistingStage(session, stageId, deps) {
  const ctx = session.context;
  const name =
    ctx.identity?.name || knowledgeForField(ctx, 'name')?.value || ctx.sourceText?.slice(0, 60);
  const location =
    ctx.identity?.location || knowledgeForField(ctx, 'location')?.value || null;
  const website =
    ctx.identity?.website || knowledgeForField(ctx, 'website')?.value || null;

  switch (stageId) {
    case 'UNDERSTANDING_BUSINESS':
      return {
        status: ANALYSIS_STAGE_STATUS.COMPLETED,
        resultSummary: String(name || 'Business'),
        evidenceCount: (ctx.knowledge || []).length,
        finding: {
          id: 'business_identified',
          title: 'Business identified',
          detail: String(name || 'Confirmed business'),
          status: 'ok',
        },
      };

    case 'RESOLVING_IDENTITY': {
      const res = ctx.resolution || {};
      const unresolved = res.status === 'unresolved';
      const matched = res.status === 'matched' || res.selectedEntityId;
      return {
        status: unresolved ? ANALYSIS_STAGE_STATUS.COMPLETED : ANALYSIS_STAGE_STATUS.COMPLETED,
        resultSummary: matched
          ? 'Public listing match reviewed'
          : unresolved
            ? 'Continuing from your description'
            : 'Identity confirmed from context',
        evidenceCount: (res.candidates || []).length || null,
        finding: {
          id: 'identity',
          title: matched ? 'Identity matched' : 'Identity from description',
          detail: matched
            ? String(name)
            : 'No confident listing selected — using confirmed details.',
          status: matched ? 'ok' : 'partial',
        },
      };
    }

    case 'CHECKING_LOCATION': {
      const geo = await resolveGeo(location, deps);
      if (!geo) {
        return {
          status: ANALYSIS_STAGE_STATUS.SKIPPED,
          resultSummary: location ? String(location) : 'Location unavailable for map',
          failureReason: 'coordinates_unavailable',
          geo: { available: false, label: location ? String(location) : null },
          finding: {
            id: 'location',
            title: 'Location',
            detail: location
              ? `${location} (map unavailable — analysis continues)`
              : 'Location not provided',
            status: location ? 'partial' : 'gap',
          },
        };
      }
      return {
        status: ANALYSIS_STAGE_STATUS.COMPLETED,
        resultSummary: geo.label || String(location),
        geo: { available: true, ...geo },
        finding: {
          id: 'location',
          title: 'Location confirmed',
          detail: geo.label || String(location),
          status: 'ok',
        },
      };
    }

    case 'CHECKING_ONLINE_PRESENCE': {
      if (!website) {
        return {
          status: ANALYSIS_STAGE_STATUS.SKIPPED,
          resultSummary: "We couldn't verify a website yet.",
          failureReason: 'website_not_found',
          probe: { ok: false, reason: 'website_not_found', offerings: [], social: [] },
          finding: {
            id: 'website',
            title: 'Website check — information unavailable',
            detail: "We couldn't verify a website yet.",
            status: 'gap',
          },
        };
      }
      const probeFn = deps.probeWebsiteForSnapshot || probeWebsiteForSnapshot;
      const probe = await probeFn(String(website), {
        businessName: String(name || ''),
        vertical: String(ctx.identity?.verticalGroup || ctx.identity?.category || ''),
      });
      if (!probe.ok || !probe.websiteReachable) {
        return {
          status: ANALYSIS_STAGE_STATUS.FAILED,
          resultSummary: "We couldn't verify a website yet.",
          failureReason: probe.reason || 'website_fetch_failed',
          probe,
          finding: {
            id: 'website',
            title: 'Website check — information unavailable',
            detail: probe.message || "We couldn't verify a website yet.",
            status: 'gap',
          },
        };
      }
      const socialCount = (probe.social || []).length;
      return {
        status: ANALYSIS_STAGE_STATUS.COMPLETED,
        resultSummary: String(website),
        evidenceCount: 1 + socialCount,
        probe,
        finding: {
          id: 'website',
          title: 'Website found',
          detail: String(website),
          status: 'ok',
        },
      };
    }

    case 'DISCOVERING_OFFERINGS': {
      const probe = session.probe;
      if (!probe || !probe.ok) {
        return {
          status: ANALYSIS_STAGE_STATUS.SKIPPED,
          resultSummary: 'Offering check skipped — no website evidence',
          failureReason: 'offering_reconstruction_skipped',
          finding: {
            id: 'offerings',
            title: 'Offerings — not checked',
            detail: 'No products or services were found from reliable sources.',
            status: 'gap',
          },
        };
      }
      const count = (probe.offerings || []).length;
      if (!count) {
        return {
          status: ANALYSIS_STAGE_STATUS.COMPLETED,
          resultSummary: 'No products or services were found from reliable sources.',
          evidenceCount: 0,
          failureReason: 'offering_evidence_absent',
          finding: {
            id: 'offerings',
            title: 'Offerings reviewed',
            detail: 'No products or services were found from reliable sources.',
            status: 'gap',
          },
        };
      }
      return {
        status: ANALYSIS_STAGE_STATUS.COMPLETED,
        resultSummary: `${count} evidence-supported offering(s)`,
        evidenceCount: count,
        finding: {
          id: 'offerings',
          title: 'Offerings reviewed',
          detail: `${count} evidence-supported offering(s)`,
          status: 'ok',
        },
      };
    }

    case 'BUILDING_SNAPSHOT': {
      const snapshot = await buildExistingBusinessSnapshot(ctx, {
        probeWebsiteForSnapshot:
          session.probe != null
            ? async () => session.probe
            : deps.probeWebsiteForSnapshot || probeWebsiteForSnapshot,
      });
      return {
        status: ANALYSIS_STAGE_STATUS.COMPLETED,
        resultSummary: 'Snapshot ready',
        snapshot,
        finding: {
          id: 'snapshot',
          title: 'Snapshot prepared',
          detail: 'Your business at a glance is ready.',
          status: 'ok',
        },
      };
    }

    default:
      return {
        status: ANALYSIS_STAGE_STATUS.SKIPPED,
        resultSummary: 'Unknown stage',
      };
  }
}

async function runIntendedStage(session, stageId, deps) {
  const ctx = session.context;
  const name =
    ctx.identity?.name ||
    ctx.identity?.businessType ||
    knowledgeForField(ctx, 'name')?.value ||
    'Business idea';
  const location =
    ctx.identity?.location || knowledgeForField(ctx, 'location')?.value || null;
  const operatingModel =
    ctx.identity?.operatingModel || knowledgeForField(ctx, 'operatingModel')?.value || null;

  switch (stageId) {
    case 'UNDERSTANDING_CONCEPT':
      return {
        status: ANALYSIS_STAGE_STATUS.COMPLETED,
        resultSummary: String(name),
        finding: {
          id: 'concept',
          title: 'Business idea understood',
          detail: String(name),
          status: 'ok',
        },
      };

    case 'CONFIRMING_TARGET_LOCATION': {
      const geo = await resolveGeo(location, deps);
      if (!geo) {
        return {
          status: ANALYSIS_STAGE_STATUS.SKIPPED,
          resultSummary: location ? String(location) : 'Target location not set',
          failureReason: 'coordinates_unavailable',
          geo: { available: false, label: location ? String(location) : null, markerKind: 'idea' },
          finding: {
            id: 'target_location',
            title: 'Target location',
            detail: location
              ? `${location} (map unavailable — analysis continues)`
              : 'Not provided yet',
            status: location ? 'partial' : 'gap',
          },
        };
      }
      return {
        status: ANALYSIS_STAGE_STATUS.COMPLETED,
        resultSummary: geo.label || String(location),
        geo: { available: true, markerKind: 'idea', ...geo },
        finding: {
          id: 'target_location',
          title: 'Target location',
          detail: geo.label || String(location),
          status: 'ok',
        },
      };
    }

    case 'STRUCTURING_BUSINESS_MODEL':
      return {
        status: operatingModel ? ANALYSIS_STAGE_STATUS.COMPLETED : ANALYSIS_STAGE_STATUS.SKIPPED,
        resultSummary: operatingModel ? String(operatingModel) : 'Model not explicitly stated',
        finding: {
          id: 'model',
          title: 'Operating model',
          detail: operatingModel ? String(operatingModel) : 'Not explicitly stated — you can add this later.',
          status: operatingModel ? 'ok' : 'gap',
        },
      };

    case 'IDENTIFYING_ASSUMPTIONS': {
      // Build light snapshot early for assumption count, or count from knowledge
      const draft = buildIntendedBusinessSnapshot(ctx);
      const count = (draft.assumptions || []).length;
      session._intendedDraft = draft;
      return {
        status: ANALYSIS_STAGE_STATUS.COMPLETED,
        resultSummary: `${count} assumption(s)`,
        evidenceCount: count,
        finding: {
          id: 'assumptions',
          title: 'Key assumptions identified',
          detail: `${count}`,
          status: 'ok',
        },
      };
    }

    case 'IDENTIFYING_INFORMATION_GAPS': {
      const draft = session._intendedDraft || buildIntendedBusinessSnapshot(ctx);
      const gaps = draft.informationGaps || [];
      return {
        status: ANALYSIS_STAGE_STATUS.COMPLETED,
        resultSummary: `${gaps.length} item(s) to clarify later`,
        evidenceCount: gaps.length,
        finding: {
          id: 'gaps',
          title: 'What we need next',
          detail: gaps.map((g) => g.label).slice(0, 3).join(' · ') || 'More detail later',
          status: 'ok',
        },
      };
    }

    case 'BUILDING_SNAPSHOT': {
      const snapshot = session._intendedDraft || buildIntendedBusinessSnapshot(ctx);
      return {
        status: ANALYSIS_STAGE_STATUS.COMPLETED,
        resultSummary: 'Concept snapshot ready',
        snapshot,
        finding: {
          id: 'snapshot',
          title: 'Preparing concept snapshot…',
          detail: 'Your business idea at a glance is ready.',
          status: 'ok',
        },
      };
    }

    default:
      return { status: ANALYSIS_STAGE_STATUS.SKIPPED, resultSummary: 'Unknown stage' };
  }
}

/**
 * @param {string | null} location
 * @param {object} deps
 */
async function resolveGeo(location, deps) {
  if (!location) return null;
  const geocode = deps.geocodeAddress || geocodeAddress;
  try {
    const results = await geocode({
      query: String(location),
      countryBias: inferCountryBias(String(location)),
    });
    const top = Array.isArray(results) ? results[0] : null;
    if (!top || !Number.isFinite(top.latitude) || !Number.isFinite(top.longitude)) return null;
    return {
      latitude: top.latitude,
      longitude: top.longitude,
      label: top.formattedAddress || String(location),
      available: true,
    };
  } catch {
    return null;
  }
}

function inferCountryBias(location) {
  if (/vietnam|ho chi minh|hanoi|hcmc/i.test(location)) return 'vn';
  if (/australia|melbourne|sydney|brisbane|perth|adelaide|richmond/i.test(location)) return 'au';
  return null;
}
