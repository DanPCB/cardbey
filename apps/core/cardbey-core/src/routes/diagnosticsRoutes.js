/**
 * Diagnostics Routes — self-diagnosis endpoints.
 */

import express from 'express';
import diagnosticsService from '../services/diagnostics/diagnosticsService.js';
import { optionalAuth, requireAuth, requireAdmin } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rateLimit.js';

const router = express.Router();

const ingestRateLimit = rateLimit({
  windowMs: 60_000,
  max: 30,
  keyGenerator: (req) => req.userId || req.ip || 'unknown',
  message: 'Frontend diagnostics rate limit exceeded. Retry in {retryAfter}s.',
  code: 'frontend_diagnostics_rate_limit',
});

router.post('/frontend-errors', ingestRateLimit, optionalAuth, async (req, res) => {
  try {
    const { errors, sessionId, userId, timestamp } = req.body ?? {};
    const result = await diagnosticsService.storeFrontendErrors({
      userId: userId || req.userId || null,
      sessionId,
      errors,
      timestamp,
    });
    return res.status(201).json({ ok: true, ...result });
  } catch (err) {
    console.error('[diagnostics/frontend-errors]', err);
    return res.status(500).json({ ok: false, error: 'frontend_errors_ingest_failed' });
  }
});

router.get('/health-report', requireAuth, requireAdmin, async (_req, res) => {
  try {
    const report = await diagnosticsService.generateHealthReport();
    return res.json({ ok: true, report });
  } catch (err) {
    console.error('[diagnostics/health-report]', err);
    return res.status(500).json({ ok: false, error: 'health_report_failed' });
  }
});

router.get('/anomalies', requireAuth, requireAdmin, async (_req, res) => {
  try {
    const anomalies = await diagnosticsService.detectAnomalies();
    return res.json({ ok: true, anomalies });
  } catch (err) {
    console.error('[diagnostics/anomalies]', err);
    return res.status(500).json({ ok: false, error: 'anomalies_failed' });
  }
});

router.get('/correlation', requireAuth, requireAdmin, async (_req, res) => {
  try {
    const correlation = await diagnosticsService.correlateErrors();
    return res.json({ ok: true, correlation });
  } catch (err) {
    console.error('[diagnostics/correlation]', err);
    return res.status(500).json({ ok: false, error: 'correlation_failed' });
  }
});

router.get('/health-score', requireAuth, requireAdmin, async (_req, res) => {
  try {
    const score = await diagnosticsService.getHealthScore();
    return res.json({ ok: true, score });
  } catch (err) {
    console.error('[diagnostics/health-score]', err);
    return res.status(500).json({ ok: false, error: 'health_score_failed' });
  }
});

export default router;
