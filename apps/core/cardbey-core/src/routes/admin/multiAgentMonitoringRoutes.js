/**
 * Multi-agent monitoring API — Control Center + rollout dashboard.
 *
 * GET  /api/admin/multi-agent/rollout-metrics
 * GET  /api/admin/multi-agent/health
 * GET  /api/admin/multi-agent/dashboard
 * GET  /api/admin/multi-agent/alerts
 * POST /api/admin/multi-agent/alerts/:id/acknowledge
 * POST /api/admin/multi-agent/alerts/:id/resolve
 */
import { Router } from 'express';
import { requireAuth, requireAdmin } from '../../middleware/auth.js';
import {
  buildMultiAgentHealth,
  buildMultiAgentRolloutMetrics,
} from '../../lib/multiAgent/buildRolloutMetrics.js';

const router = Router();
router.use(requireAuth);
router.use(requireAdmin);

async function getMonitoring() {
  const mod = await import('../../multiAgent/monitoring/index.ts');
  return mod.initMultiAgentMonitoring();
}

router.get('/multi-agent/rollout-metrics', async (req, res) => {
  try {
    const sinceHours = parseInt(String(req.query.sinceHours ?? '168'), 10) || 168;
    const data = await buildMultiAgentRolloutMetrics({ sinceHours });
    return res.json(data);
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error?.message || 'Failed to load rollout metrics',
    });
  }
});

router.get('/multi-agent/health', async (_req, res) => {
  try {
    const data = await buildMultiAgentHealth();
    return res.json(data);
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error?.message || 'Failed to load multi-agent health',
    });
  }
});

router.get('/multi-agent/dashboard', async (req, res) => {
  try {
    const { metricsStore } = await getMonitoring();
    const timeRange = String(req.query.timeRange ?? '24h');
    const data = metricsStore.getDashboardData(timeRange);
    return res.json({ success: true, data });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error?.message || 'Failed to load dashboard',
    });
  }
});

router.get('/multi-agent/mission/:missionId', async (req, res) => {
  try {
    const { metricsStore } = await getMonitoring();
    const metrics = metricsStore.getMissionMetrics(req.params.missionId);
    if (!metrics) {
      return res.status(404).json({ success: false, error: 'Mission metrics not found' });
    }
    return res.json({ success: true, data: metrics });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error?.message || 'Failed to load mission metrics',
    });
  }
});

router.post('/multi-agent/alerts/test', async (req, res) => {
  try {
    const { alertManager } = await getMonitoring();
    const severity = String(req.body?.severity ?? 'warning').toLowerCase();
    const message = String(req.body?.message ?? 'Test alert from admin monitoring API');
    const alert = await alertManager.triggerManualAlert({
      ruleId: 'admin_monitoring_test_alert',
      severity:
        severity === 'critical'
          ? 'critical'
          : severity === 'info'
            ? 'info'
            : 'warning',
      title: 'Admin Monitoring Test Alert',
      message,
      value: 1,
      threshold: 0,
    });
    return res.json({ success: true, data: alert });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error?.message || 'Failed to send test alert',
    });
  }
});

router.get('/multi-agent/alerts', async (req, res) => {
  try {
    const { alertManager } = await getMonitoring();
    const alerts = alertManager.getAlerts({
      status: req.query.status ? String(req.query.status) : undefined,
      severity: req.query.severity ? String(req.query.severity) : undefined,
      limit: parseInt(String(req.query.limit ?? '50'), 10) || 50,
    });
    return res.json({ success: true, data: alerts });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error?.message || 'Failed to load alerts',
    });
  }
});

router.post('/multi-agent/alerts/:id/acknowledge', async (req, res) => {
  try {
    const { alertManager } = await getMonitoring();
    const userId = String(req.body?.userId ?? req.user?.id ?? 'admin');
    await alertManager.acknowledgeAlert(req.params.id, userId);
    return res.json({ success: true, message: 'Alert acknowledged' });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error?.message || 'Failed to acknowledge alert',
    });
  }
});

router.post('/multi-agent/alerts/:id/resolve', async (req, res) => {
  try {
    const { alertManager } = await getMonitoring();
    const resolution = String(req.body?.resolution ?? 'Manually resolved');
    await alertManager.resolveAlert(req.params.id, resolution);
    return res.json({ success: true, message: 'Alert resolved' });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error?.message || 'Failed to resolve alert',
    });
  }
});

router.get('/multi-agent/shadow/comparisons', async (req, res) => {
  try {
    const { metricsStore } = await getMonitoring();
    const data = metricsStore.getShadowComparisons({
      limit: parseInt(String(req.query.limit ?? '100'), 10) || 100,
      offset: parseInt(String(req.query.offset ?? '0'), 10) || 0,
    });
    return res.json({ success: true, data });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error?.message || 'Failed to load shadow comparisons',
    });
  }
});

export default router;
