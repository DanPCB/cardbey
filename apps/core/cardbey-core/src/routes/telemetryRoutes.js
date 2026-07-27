/**
 * Mission Console orchestration telemetry — read-only summaries for dashboard UI.
 * GET /api/telemetry/summary (requires auth).
 * POST /api/telemetry/code-fix-proposal — Path A: Claude code_fix proposal only (no writes).
 */

import express from 'express';
import { requireAuth, requireAdmin, optionalAuth } from '../middleware/auth.js';
import { getPrismaClient } from '../lib/prisma.js';
import { getMissionConsoleTelemetryBuffers } from '../lib/orchestrator/missionConsoleTelemetryStore.js';
import {
  isPipelineOutputDualWriteEnabled,
  ORCHESTRA_STORE_BUILD_STEP_KEY,
} from '../lib/orchestrator/pipelineCanonicalResults.js';
import {
  validateCodeFixGuardrails,
  validatePlaybookShape,
  validateTelemetryIssueShape,
  buildTelemetryCodeFixDescription,
} from '../lib/telemetry/telemetryCodeFixGuardrails.js';

const router = express.Router();

/** One-time diagnostic: first authenticated hit to /summary (no user-identifying data). */
let loggedFirstSummaryRequest = false;

function asObject(v) {
  return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
}

/**
 * @param {Record<string, unknown>} meta
 * @param {string|undefined} missionType
 * @returns {'performer' | 'store' | 'unknown'}
 */
function deriveExecutionSourceType(meta, missionType) {
  const s = typeof meta.source === 'string' ? meta.source.trim().toLowerCase() : '';
  if (s.startsWith('missions_store')) return 'store';
  if (s.startsWith('performer_') || s.includes('performer')) return 'performer';
  const t = typeof missionType === 'string' ? missionType.trim().toLowerCase() : '';
  if (t === 'store') return 'store';
  return 'unknown';
}

/**
 * Sample recent pipelines for outputs vs metadataJson.stepOutputs heuristics.
 *
 * **Mismatch definition (narrow):** `mismatch` is true only when `PIPELINE_OUTPUT_DUAL_WRITE` is enabled,
 * `outputsJson.jobId` is set (store-orchestra path), and `metadataJson.stepOutputs.orchestra_store_build`
 * is absent. It does **not** score proactive-performer missions that only populate `stepOutputs` tool keys.
 *
 * @param {import('../lib/prismaClient.js').PrismaClient} prisma
 * @param {number} limit
 */
async function buildResultConsistencySample(prisma, limit) {
  const take = Math.min(100, Math.max(1, limit || 25));
  const rows = await prisma.missionPipeline
    .findMany({
      orderBy: { updatedAt: 'desc' },
      take,
      select: { id: true, type: true, outputsJson: true, metadataJson: true, updatedAt: true },
    })
    .catch(() => []);

  const dual = isPipelineOutputDualWriteEnabled();

  return rows.map((r) => {
    const oj = asObject(r.outputsJson);
    const meta = asObject(r.metadataJson);
    const so = asObject(meta.stepOutputs);
    const outputsJsonPresent = Object.keys(oj).length > 0;
    const metadataStepOutputsPresent = Object.keys(so).length > 0;
    const hasJobId = oj.jobId != null;
    const mirrorVal = so[ORCHESTRA_STORE_BUILD_STEP_KEY];
    const hasOrchestraMirror = mirrorVal != null && typeof mirrorVal === 'object';
    let mismatch = false;
    /** @type {string[]} */
    const missingFields = [];
    if (dual && hasJobId && !hasOrchestraMirror) {
      mismatch = true;
      missingFields.push(ORCHESTRA_STORE_BUILD_STEP_KEY);
    }
    return {
      missionId: r.id,
      outputsJsonPresent,
      metadataStepOutputsPresent,
      hasJobId,
      hasOrchestraMirror,
      executionSourceType: deriveExecutionSourceType(meta, r.type),
      mismatch,
      ...(missingFields.length ? { missingFields } : {}),
      source: typeof meta.source === 'string' ? meta.source : undefined,
      timestamp: r.updatedAt ? new Date(r.updatedAt).toISOString() : undefined,
    };
  });
}

router.get('/summary', requireAuth, async (req, res, next) => {
  try {
    if (!loggedFirstSummaryRequest) {
      loggedFirstSummaryRequest = true;
      console.log('[telemetry] first GET /summary (Mission Console dashboard)');
    }
    const prisma = getPrismaClient();
    const { pipelineWrites, intentPlans, executionEvents } = getMissionConsoleTelemetryBuffers();
    const dualWriteEnv = isPipelineOutputDualWriteEnabled();
    const resultConsistency = await buildResultConsistencySample(prisma, 25);

    const environmentName =
      process.env.CARDBEY_ENV_NAME?.trim() ||
      (process.env.NODE_ENV === 'production' ? 'production' : 'development');

    res.json({
      ok: true,
      pipelineWrites,
      intentPlans,
      executionEvents: executionEvents ?? [],
      resultConsistency,
      /** What `resultConsistency[].mismatch` measures when `pipelineOutputDualWrite` is true. */
      mismatchType: 'orchestra_mirror_gap',
      pipelineOutputDualWrite: dualWriteEnv,
      environmentName,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Path A: proposal-only code_fix from Mission Console telemetry (same engine as performer; no disk writes).
 * Body: { action: "propose_patch", guardrails: { proposalOnly, noFileWrites, noAutoApply, humanApprovalRequired }, issue, playbook, telemetryContext? }
 */
router.post('/code-fix-proposal', requireAuth, async (req, res, next) => {
  try {
    const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
    if (body.action !== 'propose_patch') {
      return res.status(200).json({ ok: false, message: 'invalid_action' });
    }
    const g = body.guardrails;
    if (!validateCodeFixGuardrails(g)) {
      return res.status(200).json({ ok: false, message: 'guardrails_required' });
    }
    const issue = body.issue;
    if (!validateTelemetryIssueShape(issue)) {
      return res.status(200).json({ ok: false, message: 'invalid_issue' });
    }
    const issueRec = /** @type {Record<string, unknown>} */ (issue);
    const category = String(issueRec.category);
    const playbook = body.playbook;
    if (!validatePlaybookShape(playbook, category)) {
      return res.status(200).json({ ok: false, message: 'invalid_playbook' });
    }
    const playbookRec = /** @type {Record<string, unknown>} */ (playbook);
    const telemetryContext =
      body.telemetryContext && typeof body.telemetryContext === 'object' && !Array.isArray(body.telemetryContext)
        ? /** @type {Record<string, unknown>} */ (body.telemetryContext)
        : {};

    const description = buildTelemetryCodeFixDescription(issueRec, playbookRec, telemetryContext);
    const likely = playbookRec.likelyFiles;
    const filePaths = Array.isArray(likely)
      ? likely.map((x) => String(x ?? '').trim()).filter(Boolean)
      : [];
    const { runCodeFixAnalysis } = await import('../services/codeFixPerformerService.js');
    const analysis = await runCodeFixAnalysis({ description, filePaths });
    if (!analysis.ok) {
      return res.status(200).json({ ok: false, message: analysis.message });
    }

    return res.status(200).json({
      ok: true,
      pathA: true,
      guardrailsEcho: {
        proposalOnly: true,
        noFileWrites: true,
        noAutoApply: true,
        humanApprovalRequired: true,
      },
      diagnosis: typeof issueRec.summary === 'string' ? issueRec.summary : '',
      output: analysis.output,
      playbookEcho: {
        likelyFiles: playbookRec.likelyFiles,
        constraints: playbookRec.constraints,
        validationSteps: playbookRec.validationSteps,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/telemetry/hero-video — dashboard hero upload verify / playback events.
 * Body: { event, url?, storageKey?, attempt?, status?, durationMs?, errorCode?, environment?, ts? }
 */
router.post('/hero-video', optionalAuth, async (req, res, next) => {
  try {
    const {
      parseHeroVideoTelemetryBody,
      recordHeroVideoTelemetry,
      logHeroVideoTelemetrySideEffects,
    } = await import('../services/telemetry/heroVideoTelemetryService.js');

    const parsed = parseHeroVideoTelemetryBody(req.body);
    if (!parsed) {
      return res.status(400).json({ ok: false, error: 'invalid_event', message: 'Unknown or missing event type' });
    }

    const prisma = getPrismaClient();
    const row = await recordHeroVideoTelemetry(prisma, parsed, { userId: req.userId ?? null });
    logHeroVideoTelemetrySideEffects(row);

    return res.status(200).json({ ok: true, id: row.id });
  } catch (err) {
    console.error('[telemetry] POST /hero-video failed:', err?.message || err);
    return next(err);
  }
});

/**
 * POST /api/telemetry/navigation — dashboard navigation / admin discovery events.
 */
router.post('/navigation', optionalAuth, async (req, res, next) => {
  try {
    const {
      parseNavigationTelemetryBody,
      recordNavigationTelemetry,
      logNavigationTelemetrySideEffects,
    } = await import('../services/telemetry/navigationTelemetryService.js');

    const parsed = parseNavigationTelemetryBody({
      ...req.body,
      userId: req.body?.userId ?? req.userId ?? null,
      userRole: req.body?.userRole ?? req.user?.role ?? null,
    });
    if (!parsed) {
      return res.status(400).json({ ok: false, error: 'invalid_event', message: 'Unknown or missing event type' });
    }

    const prisma = getPrismaClient();
    const row = await recordNavigationTelemetry(prisma, parsed, {
      userId: req.userId ?? parsed.userId,
      userRole: req.user?.role ?? parsed.userRole,
    });
    logNavigationTelemetrySideEffects(row);

    return res.status(200).json({ ok: true, id: row.id });
  } catch (err) {
    console.error('[telemetry] POST /navigation failed:', err?.message || err);
    return next(err);
  }
});

/**
 * GET /api/telemetry/navigation/discovery — admin-only admin tool discovery analysis.
 */
router.get('/navigation/discovery', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const prisma = getPrismaClient();
    const { detectAdminToolDiscoveryIssues, buildAdminDiscoveryMetrics } = await import(
      '../services/detection/adminToolDiscovery.js'
    );
    const windowHours = parseInt(String(req.query.windowHours ?? '24'), 10);
    const [discovery, metrics] = await Promise.all([
      detectAdminToolDiscoveryIssues(prisma, { windowHours: Number.isFinite(windowHours) ? windowHours : 24 }),
      buildAdminDiscoveryMetrics(prisma),
    ]);
    return res.status(200).json({ ok: true, discovery, metrics });
  } catch (err) {
    console.error('[telemetry] GET /navigation/discovery failed:', err?.message || err);
    return next(err);
  }
});

export default router;
