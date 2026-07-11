/**
 * Self-audit API routes.
 */

import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/auth.js';
import {
  SelfAuditOrchestrator,
  getSelfAuditStatus,
  ingestFrontendTelemetryEvent,
} from '../selfAudit/orchestrator.js';
import { getTelemetryBridgeStatus } from '../selfAudit/integration/telemetryBridge.js';
import { collectMonitoringMetrics } from '../selfAudit/integration/monitoringBridge.js';
import { loadFixRecords } from '../selfAudit/fixHistory.js';

const router = express.Router();

/**
 * GET /api/self-audit/status
 */
router.get('/status', requireAuth, async (_req, res, next) => {
  try {
    const status = getSelfAuditStatus();
    return res.status(200).json({ ok: true, ...status });
  } catch (err) {
    return next(err);
  }
});

/**
 * GET /api/self-audit/telemetry-status
 */
router.get('/telemetry-status', requireAuth, requireAdmin, async (_req, res, next) => {
  try {
    const bridge = getTelemetryBridgeStatus();
    const syncEnabled =
      String(process.env.TELEMETRY_SYNC_ENABLED ?? 'true').trim().toLowerCase() !== 'false';
    return res.status(200).json({
      ok: true,
      bridge,
      syncEnabled,
      syncIntervalSeconds: Number(process.env.TELEMETRY_SYNC_INTERVAL ?? 300),
    });
  } catch (err) {
    return next(err);
  }
});

/**
 * POST /api/self-audit/run
 */
router.post('/run', requireAuth, requireAdmin, async (_req, res, next) => {
  try {
    const orchestrator = new SelfAuditOrchestrator();
    const metrics = await collectMonitoringMetrics();
    const result = await orchestrator.autoHeal({
      logs: [],
      errors: [],
      metrics,
      codebase: {},
      uiState: {},
    });
    return res.status(200).json({
      ok: true,
      issuesFound: result.issues.length,
      fixesProposed: result.fixes.length,
      results: result.results,
      issues: result.issues,
      fixes: result.fixes.map((f) => ({
        issueId: f.issueId,
        description: f.description,
        status: f.status,
        guardrails: f.guardrails,
      })),
    });
  } catch (err) {
    return next(err);
  }
});

/**
 * GET /api/self-audit/history
 */
router.get('/history', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 50)));
    const records = loadFixRecords().slice(-limit).reverse();
    return res.status(200).json({ ok: true, records, count: records.length });
  } catch (err) {
    return next(err);
  }
});

/**
 * POST /api/self-audit/fix/:issueId
 */
router.post('/fix/:issueId', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { issueId } = req.params;
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const confirmed = body.confirmed === true;

    if (!confirmed) {
      return res.status(400).json({
        ok: false,
        message: 'confirmation_required',
        detail: 'Set confirmed: true to apply governed fix proposal',
      });
    }

    const orchestrator = new SelfAuditOrchestrator();
    const record = await orchestrator.applyFixByIssueId(issueId, {
      confirmed: true,
      executedBy: req.user?.id ?? req.user?.userId ?? 'admin',
    });

    if (!record) {
      return res.status(404).json({ ok: false, message: 'issue_not_found' });
    }

    return res.status(200).json({ ok: true, record });
  } catch (err) {
    return next(err);
  }
});

/**
 * POST /api/self-audit/events — frontend telemetry ingestion
 */
router.post('/events', requireAuth, async (req, res, next) => {
  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const events = Array.isArray(body.events) ? body.events : [body];

    for (const event of events) {
      if (event && typeof event.type === 'string') {
        ingestFrontendTelemetryEvent({
          type: event.type,
          payload: event.payload,
          timestamp: event.timestamp,
        });
      }
    }

    return res.status(200).json({ ok: true, ingested: events.length });
  } catch (err) {
    return next(err);
  }
});

export default router;
