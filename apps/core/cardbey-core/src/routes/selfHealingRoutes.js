/**
 * Self-healing bridge: admin_tool_discovery → governed code_fix proposals.
 * Super-admin only; proposal-only (no auto-apply).
 */

import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireSuperAdmin } from '../lib/authorization.js';
import { getPrismaClient } from '../lib/prisma.js';
import {
  PATH_A_CODE_FIX_GUARDRAILS,
  validateCodeFixGuardrails,
} from '../lib/telemetry/telemetryCodeFixGuardrails.js';
import { buildAdminDiscoveryCodeFixPayload } from '../services/selfHealing/buildAdminDiscoveryCodeFixPayload.js';
import { detectAdminToolDiscoveryIssues } from '../services/detection/adminToolDiscovery.js';
import { runCodeFixAnalysis } from '../services/codeFixPerformerService.js';

const router = express.Router();

function parseWindowHours(raw) {
  const n = parseInt(String(raw ?? '24'), 10);
  if (!Number.isFinite(n)) return 24;
  return Math.min(168, Math.max(1, n));
}

/**
 * GET /api/self-healing/discovery-gaps
 * Read-only admin tool discovery analysis.
 */
router.get('/discovery-gaps', requireAuth, requireSuperAdmin, async (req, res, next) => {
  try {
    const prisma = getPrismaClient();
    const windowHours = parseWindowHours(req.query.windowHours);
    const discovery = await detectAdminToolDiscoveryIssues(prisma, { windowHours });
    return res.status(200).json({
      ok: true,
      discovery,
      summary: {
        windowHours: discovery.windowHours,
        sessionsAnalyzed: discovery.sessionsAnalyzed,
        problematicCount: discovery.problematicCount,
        hasGlobalFix: Boolean(discovery.suggestedGlobalFix),
      },
    });
  } catch (err) {
    console.error('[SelfHealing] GET /discovery-gaps failed:', err?.message || err);
    return next(err);
  }
});

/**
 * POST /api/self-healing/propose-from-discovery
 * Body: { guardrails?, windowHours?, sessionId?, issueId? }
 */
router.post('/propose-from-discovery', requireAuth, requireSuperAdmin, async (req, res, next) => {
  try {
    const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
    const guardrails = body.guardrails ?? PATH_A_CODE_FIX_GUARDRAILS;
    if (!validateCodeFixGuardrails(guardrails)) {
      return res.status(200).json({ ok: false, message: 'guardrails_required' });
    }

    const prisma = getPrismaClient();
    const windowHours = parseWindowHours(body.windowHours);
    const payloads = await buildAdminDiscoveryCodeFixPayload(prisma, {
      windowHours,
      sessionId: typeof body.sessionId === 'string' ? body.sessionId : undefined,
      issueId: typeof body.issueId === 'string' ? body.issueId : undefined,
    });

    if (payloads.length === 0) {
      return res.status(200).json({
        ok: true,
        proposals: [],
        count: 0,
        message: 'No eligible admin discovery gaps for proposal (high severity excluded or none detected)',
        guardrailsEcho: { ...PATH_A_CODE_FIX_GUARDRAILS },
      });
    }

    /** @type {Array<Record<string, unknown>>} */
    const proposals = [];

    for (const payload of payloads) {
      const analysis = await runCodeFixAnalysis({
        description: String(payload.description ?? ''),
        filePaths: Array.isArray(payload.filePaths) ? payload.filePaths : [],
        repoContext: JSON.stringify(
          {
            source: 'self_healing_admin_tool_discovery',
            issueId: payload.issueId,
            sessionId: payload.sessionId,
            userId: payload.userId,
            metadata: payload.metadata,
          },
          null,
          2,
        ),
      });

      proposals.push({
        ...payload,
        analysis,
        status: analysis.ok ? 'pending_approval' : 'analysis_failed',
        createdAt: new Date().toISOString(),
        guardrails: { ...PATH_A_CODE_FIX_GUARDRAILS },
      });
    }

    const okCount = proposals.filter((p) => p.status === 'pending_approval').length;

    return res.status(200).json({
      ok: true,
      proposals,
      count: proposals.length,
      okCount,
      message: `Created ${okCount} governed proposal(s) from admin discovery gaps`,
      guardrailsEcho: { ...PATH_A_CODE_FIX_GUARDRAILS },
    });
  } catch (err) {
    console.error('[SelfHealing] POST /propose-from-discovery failed:', err?.message || err);
    return next(err);
  }
});

export default router;
