/**
 * Reliability Routes — manage reliability features (P6).
 */

import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import autoHeal from '../services/reliability/autoHeal.js';
import rateLimiter from '../services/reliability/rateLimiter.js';
import bulkhead from '../services/reliability/bulkhead.js';
import circuitBreaker from '../services/reliability/circuitBreaker.js';
import sloTracker from '../services/reliability/sloTracker.js';
import alerting from '../services/reliability/alerting.js';
import {
  pushWebhookInbox,
  getWebhookInbox,
  clearWebhookInbox,
} from '../services/reliability/webhookInbox.js';

const router = Router();

router.get('/auto-heal/status', requireAuth, requireAdmin, async (req, res) => {
  try {
    const history = autoHeal.getHistory();
    const healthScore = await autoHeal.getHealthScore();
    res.json({
      ok: true,
      isRunning: autoHeal.isRunning,
      healthScore,
      history,
    });
  } catch (error) {
    console.error('[reliability/auto-heal/status]', error);
    res.status(500).json({ ok: false, error: 'auto_heal_status_failed' });
  }
});

router.get('/rate-limiter/status', requireAuth, requireAdmin, (req, res) => {
  try {
    const limits = rateLimiter.getLimits();
    res.json({
      ok: true,
      limits,
      endpoints: limits,
    });
  } catch (error) {
    console.error('[reliability/rate-limiter/status]', error);
    res.status(500).json({ ok: false, error: 'rate_limiter_status_failed' });
  }
});

router.get('/bulkhead/status', requireAuth, requireAdmin, (req, res) => {
  try {
    const statuses = bulkhead.getAllStatuses();
    res.json({ ok: true, statuses });
  } catch (error) {
    console.error('[reliability/bulkhead/status]', error);
    res.status(500).json({ ok: false, error: 'bulkhead_status_failed' });
  }
});

router.get('/circuit-breaker/status', requireAuth, requireAdmin, (req, res) => {
  try {
    const statuses = circuitBreaker.getAllStatuses();
    res.json({ ok: true, statuses });
  } catch (error) {
    console.error('[reliability/circuit-breaker/status]', error);
    res.status(500).json({ ok: false, error: 'circuit_breaker_status_failed' });
  }
});

router.get('/slo/status', requireAuth, requireAdmin, async (req, res) => {
  try {
    const breaches = await sloTracker.evaluate();
    const failurePatterns = await sloTracker.getFailurePatterns(10);
    res.json({
      ok: true,
      objectives: sloTracker.getObjectives(),
      recentBreaches: sloTracker.getBreachHistory(20),
      breachesThisEvaluation: breaches,
      failurePatterns,
    });
  } catch (error) {
    console.error('[reliability/slo/status]', error);
    res.status(500).json({ ok: false, error: 'slo_status_failed' });
  }
});

router.get('/alerts', requireAuth, requireAdmin, (req, res) => {
  try {
    const limit = req.query.limit ? Number(req.query.limit) : 50;
    const severity = req.query.severity ? String(req.query.severity) : null;
    const alerts = alerting.getAlerts(limit, severity);
    res.json({ ok: true, alerts });
  } catch (error) {
    console.error('[reliability/alerts]', error);
    res.status(500).json({ ok: false, error: 'alerts_list_failed' });
  }
});

router.post('/alerts/test', requireAuth, requireAdmin, async (req, res) => {
  try {
    const severity = req.body?.severity ? String(req.body.severity) : 'medium';
    const alert = await alerting.sendAlert({
      title: 'Test Alert',
      message: 'This is a test alert from the reliability layer',
      severity,
    });
    res.json({ ok: true, alert });
  } catch (error) {
    console.error('[reliability/alerts/test]', error);
    res.status(500).json({ ok: false, error: 'alert_test_failed' });
  }
});

// Dev-only: local webhook target for RELIABILITY_WEBHOOK_URL testing
if (process.env.NODE_ENV !== 'production') {
  router.post('/webhook/inbox', (req, res) => {
    const payload = req.body && typeof req.body === 'object' ? req.body : { raw: req.body };
    pushWebhookInbox(payload);
    res.status(200).json({ ok: true, received: true });
  });

  router.get('/webhook/inbox', requireAuth, requireAdmin, (req, res) => {
    const limit = req.query.limit ? Number(req.query.limit) : 50;
    res.json({ ok: true, inbox: getWebhookInbox(limit) });
  });

  router.delete('/webhook/inbox', requireAuth, requireAdmin, (_req, res) => {
    clearWebhookInbox();
    res.json({ ok: true, cleared: true });
  });
}

export default router;
