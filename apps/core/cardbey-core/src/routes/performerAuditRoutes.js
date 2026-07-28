/**
 * Performer understanding audit API (Phase 4).
 * POST ingest (optionalAuth) · GET metrics (platform admin).
 */

import { Router } from 'express';
import { optionalAuth, requireAuth, requireAdmin } from '../middleware/auth.js';
import {
  parseAuditEntry,
  checkAuditRateLimit,
  logPerformerAuditEntry,
  logPerformerAuditBatch,
  getPerformerAuditMetrics,
  getPerformerAuditTrends,
  getPerformerAuditFailures,
  getPerformerAuditDetail,
  maybeSendPerformerAuditSlackAlerts,
} from '../lib/performer/performerAuditService.js';

const router = Router();

function actorUserId(req) {
  const id = req.user?.id ?? req.user?.userId ?? null;
  return typeof id === 'string' && id.trim() ? id.trim() : null;
}

router.post('/v1', optionalAuth, async (req, res) => {
  try {
    const parsed = parseAuditEntry(req.body);
    if (!parsed.ok) {
      return res.status(400).json({ success: false, error: parsed.error });
    }
    if (!checkAuditRateLimit(parsed.data.sessionId)) {
      return res.status(429).json({ success: false, error: 'rate_limited' });
    }
    const row = await logPerformerAuditEntry(parsed.data, { userId: actorUserId(req) });
    return res.status(202).json({ success: true, id: row.id });
  } catch (err) {
    console.warn('[PerformerAudit] POST /v1 failed:', err?.message ?? err);
    return res.status(500).json({ success: false, error: 'audit_write_failed' });
  }
});

router.post('/v1/batch', optionalAuth, async (req, res) => {
  try {
    const logs = Array.isArray(req.body?.logs) ? req.body.logs : Array.isArray(req.body) ? req.body : [];
    if (!logs.length) {
      return res.status(400).json({ success: false, error: 'empty_batch' });
    }
    // Non-blocking for client: respond after enqueue attempt (still await writes for correctness).
    const ids = await logPerformerAuditBatch(logs, { userId: actorUserId(req) });
    return res.status(202).json({ success: true, ids, accepted: ids.length });
  } catch (err) {
    console.warn('[PerformerAudit] POST /v1/batch failed:', err?.message ?? err);
    return res.status(500).json({ success: false, error: 'audit_batch_failed' });
  }
});

router.get('/metrics', requireAuth, requireAdmin, async (req, res) => {
  try {
    const metrics = await getPerformerAuditMetrics(req.query ?? {});
    void maybeSendPerformerAuditSlackAlerts(metrics.alerts ?? []);
    return res.json({ success: true, metrics });
  } catch (err) {
    console.warn('[PerformerAudit] GET /metrics failed:', err?.message ?? err);
    return res.status(500).json({ success: false, error: 'metrics_failed' });
  }
});

router.get('/trends', requireAuth, requireAdmin, async (req, res) => {
  try {
    const trends = await getPerformerAuditTrends(req.query ?? {});
    return res.json({ success: true, trends });
  } catch (err) {
    console.warn('[PerformerAudit] GET /trends failed:', err?.message ?? err);
    return res.status(500).json({ success: false, error: 'trends_failed' });
  }
});

router.get('/failures', requireAuth, requireAdmin, async (req, res) => {
  try {
    const failures = await getPerformerAuditFailures({
      limit: req.query?.limit,
      offset: req.query?.offset,
    });
    return res.json({ success: true, failures });
  } catch (err) {
    console.warn('[PerformerAudit] GET /failures failed:', err?.message ?? err);
    return res.status(500).json({ success: false, error: 'failures_failed' });
  }
});

router.get('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const detail = await getPerformerAuditDetail(req.params.id);
    if (!detail) return res.status(404).json({ success: false, error: 'not_found' });
    return res.json({ success: true, detail });
  } catch (err) {
    console.warn('[PerformerAudit] GET /:id failed:', err?.message ?? err);
    return res.status(500).json({ success: false, error: 'detail_failed' });
  }
});

export default router;
