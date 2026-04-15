/**
 * Mission Console orchestration telemetry — read-only summaries for dashboard UI.
 * GET /api/telemetry/summary (requires auth).
 * POST /api/telemetry/code-fix-proposal — Path A: Claude code_fix proposal only (no writes).
 */

import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import { getPrismaClient } from '../lib/prisma.js';
import { getMissionConsoleTelemetryBuffers } from '../lib/orchestrator/missionConsoleTelemetryStore.js';
import {
  isPipelineOutputDualWriteEnabled,
  ORCHESTRA_STORE_BUILD_STEP_KEY,
} from '../lib/orchestrator/pipelineCanonicalResults.js';

const router = express.Router();

const ALLOWED_TELEMETRY_ISSUE_CATEGORIES = new Set([
  'orchestra_mirror_gap',
  'planner_missing_context',
  'performer_result_shape',
  'telemetry_stream_missing',
]);

/**
 * @param {unknown} playbook
 * @param {string} category
 */
function validatePlaybookShape(playbook, category) {
  if (!playbook || typeof playbook !== 'object' || Array.isArray(playbook)) return false;
  const pb = /** @type {Record<string, unknown>} */ (playbook);
  if (pb.category !== category) return false;
  if (!Array.isArray(pb.likelyFiles) || pb.likelyFiles.length === 0) return false;
  if (!Array.isArray(pb.constraints) || pb.constraints.length === 0) return false;
  if (!Array.isArray(pb.validationSteps) || pb.validationSteps.length === 0) return false;
  return true;
}

/**
 * @param {unknown} issue
 */
function validateTelemetryIssueShape(issue) {
  if (!issue || typeof issue !== 'object' || Array.isArray(issue)) return false;
  const i = /** @type {Record<string, unknown>} */ (issue);
  const cat = typeof i.category === 'string' ? i.category : '';
  if (!ALLOWED_TELEMETRY_ISSUE_CATEGORIES.has(cat)) return false;
  if (i.suggestedTool !== 'code_fix') return false;
  if (typeof i.title !== 'string' || !i.title.trim()) return false;
  if (typeof i.summary !== 'string' || !i.summary.trim()) return false;
  if (!Array.isArray(i.evidence)) return false;
  return true;
}

/**
 * @param {Record<string, unknown>} issue
 * @param {Record<string, unknown>} playbook
 * @param {Record<string, unknown>} telemetryContext
 */
function buildTelemetryCodeFixDescription(issue, playbook, telemetryContext) {
  const evidence = Array.isArray(issue.evidence) ? issue.evidence : [];
  const likelyFiles = Array.isArray(playbook.likelyFiles) ? playbook.likelyFiles : [];
  const constraints = Array.isArray(playbook.constraints) ? playbook.constraints : [];
  const validationSteps = Array.isArray(playbook.validationSteps) ? playbook.validationSteps : [];

  const parts = [
    '[PATH_A_TELEMETRY_CODE_FIX] Proposal only. Human approval required before any edit. No API auto-apply and no file writes from this endpoint.',
    `Category: ${issue.category}`,
    `Title: ${issue.title}`,
    `Severity: ${typeof issue.severity === 'string' ? issue.severity : 'unknown'}`,
    `Telemetry heuristic confidence: ${typeof issue.confidence === 'number' ? issue.confidence : 'n/a'}`,
    `Summary: ${issue.summary}`,
    'Evidence:',
    ...evidence.map((e) => ` - ${String(e)}`),
    'Playbook — likely files:',
    ...likelyFiles.map((f) => ` - ${String(f)}`),
    'Playbook — constraints:',
    ...constraints.map((c) => ` - ${String(c)}`),
    'Playbook — validation steps (after manual patch):',
    ...validationSteps.map((v) => ` - ${String(v)}`),
    'Telemetry context (JSON):',
    JSON.stringify(telemetryContext, null, 2),
  ];
  return parts.join('\n');
}

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
 * @param {import('@prisma/client').PrismaClient} prisma
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
    if (
      !g ||
      typeof g !== 'object' ||
      g.proposalOnly !== true ||
      g.noFileWrites !== true ||
      g.noAutoApply !== true ||
      g.humanApprovalRequired !== true
    ) {
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

export default router;
